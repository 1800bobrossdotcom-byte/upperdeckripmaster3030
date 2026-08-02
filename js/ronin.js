/* ripmaster3030studios — NEON RONIN.
 *
 * A side-scrolling neon ninja brawler. Punch / kick / katana combos, hold to block,
 * grab power-ups, throw shuriken, pop a spin-blade special. A free-for-all of meme
 * ninjas on a rooftop; last blade standing ranks the podium. Same wager spine as the
 * other cabinets (rake-burn ante · podium 50/30/20 · card loadout amplifies) — and
 * CERTAIN CARDS UNLOCK CERTAIN FIGHTERS. Procedural articulated fighters on 2D canvas;
 * no libs. Real on-chain token-pot escrow = Phase-2; the rake burn is the real part today.
 */
(() => {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3, prizm: 4 };
  const RC = { common: '--cyan', uncommon: '--lime', rare: '--violet', mythic: '--amber', prizm: '--magenta' };
  const BODY = 1.4;   // uniform render scale of the fighters — bigger, chunkier duellists

  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, groundY = 0, worldW = 2000;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); groundY = H * 0.86; }
  resize(); addEventListener('resize', resize);

  // ── deck / vault ──
  let DECK = [], bySlug = new Map();
  const vault = () => { try { return JSON.parse(localStorage.getItem('urm_vault') || '[]'); } catch { return []; } };
  const saveVault = v => { try { localStorage.setItem('urm_vault', JSON.stringify(v.slice(-200))); } catch {} };
  const ownedSlugs = () => vault().map(e => e && e.slug).filter(s => bySlug.has(s));
  const liveToken = () => { try { return window.RipWallet && RipWallet.isLive(); } catch { return false; } };
  const myHandle = () => { try { return (window.RipNet && RipNet.me && RipNet.me().handle) || localStorage.getItem('urm_net_handle') || 'you'; } catch { return 'you'; } };
  function loadDeck() { return fetch('cards/manifest.json').then(r => r.json()).then(m => { DECK = m.cards || []; bySlug = new Map(DECK.map(c => [c.slug, c])); }).catch(() => {}); }

  // ── roster: archetypes + card unlock rules ──
  const ARCH = {
    ronin:    { name: 'GREY RONIN', face: 'ronin', col: '#c9d2e6', tint: '#9fb0d0', hp: 100, spd: 1.00, pow: 1.00, reach: 1.00, weapon: 'katana',  weaponArt: 'katana', build: {},                    meter: 1.00, shuri: 0, blurb: 'straw-hat swordsman', unlock: () => ({ ok: true }) },
    kappa:    { name: 'KAPPA',      face: 'pepe',  col: '#3fae4a', tint: '#2bff80', hp: 88,  spd: 1.30, pow: 0.82, reach: 0.90, weapon: 'tanto',   weaponArt: 'tanto',  build: { legLen: 0.78 },        meter: 1.16, shuri: 0, blurb: 'shelled frog · dual tanto', unlock: o => ({ ok: o.count >= 1, need: 'own any card' }) },
    doomer:   { name: 'DOOMER',     face: 'wojak', col: '#7f95ad', tint: '#8fa0b8', hp: 128, spd: 0.82, pow: 1.34, reach: 1.14, weapon: 'nodachi', weaponArt: 'nodachi', build: { hunch: 0.5 },          meter: 0.86, shuri: 0, blurb: 'hooded · heavy cleaver', unlock: o => ({ ok: o.has('BLOCK OMEN'), need: 'a BLOCK OMEN card' }) },
    oni:      { name: 'ONI',        face: 'oni',   col: '#df463b', tint: '#ff6b57', hp: 120, spd: 0.92, pow: 1.40, reach: 1.22, weapon: 'nodachi', weaponArt: 'club',   build: { legLen: 1.04 },        meter: 0.96, shuri: 0, blurb: 'horned demon · spiked club', unlock: o => ({ ok: o.rank >= 3, need: 'a MYTHIC+ card' }) },
    kunoichi: { name: 'KUNOICHI',   face: 'kuno',  col: '#ff4fa3', tint: '#ff2ad9', hp: 92,  spd: 1.16, pow: 0.96, reach: 1.04, weapon: 'tanto',   weaponArt: 'sickle', build: { legLen: 1.08 },        meter: 1.12, shuri: 3, blurb: 'scarfed · chain-sickle', unlock: o => ({ ok: o.has('WHALE SONG'), need: 'a WHALE SONG card' }) },
    prizm:    { name: 'PRIZMANCER', face: 'prizm', col: '#b47bff', tint: '#e6c8ff', hp: 110, spd: 1.12, pow: 1.15, reach: 1.06, weapon: 'katana',  weaponArt: 'light',  build: {},                    meter: 1.42, shuri: 1, blurb: 'crystalline · light blade', unlock: o => ({ ok: o.rank >= 4, need: 'a PRIZM card' }) },

    /* ── THE GENERATED ROSTER (task #85) ────────────────────────────────────────────────────
     * Seven procedurally-built bodies, 1.25 MB for all of them — less than two imported ones.
     * ⚑ ADDING A KEY HERE IS WHAT FIELDS A FIGHTER: `ARCH_KEYS.forEach` below loads
     *   `models/<key>.skn`, so the key MUST equal the filename. They were loading correctly and
     *   simply had no entry, which is why they were built but never playable.
     *
     * ⚑ NAMES ARE THE STUDIO'S, and they are the casino read the whole project runs on —
     *   LONG ODDS · HOUSE EDGE · BAD BEAT · PRIZE MASCOT. CC0 waives copyright and never
     *   trademark, so a body may be INFORMED by a source and never NAMED after one. Provenance
     *   per body is in models/cc0/README.md against its docs/CC0-SOURCES.md row.
     *
     * ⚠ BALANCE IS A FIRST PASS AND IS MEANT TO BE TUNED. The six originals span hp 88–128,
     *   spd 0.82–1.30, pow 0.82–1.40, reach 0.90–1.22, meter 0.86–1.42. These seven are placed
     *   to FILL GAPS rather than duplicate: each trades one axis hard against another, and none
     *   is strictly better than an original. Numbers, not vibes, so they can be argued with.
     *
     * ⚑ PRIZE MASCOT IS THE HOUSE CHARACTER AND UNLOCKS FREE. It comes from the artist's own
     *   Fake Rares practice, not from third-party CC0 — so it leads the roster and asks nothing
     *   of the player, the way a mascot should. Everything else is earned. */
    'rip-mascot': { name: 'PRIZE MASCOT', face: 'ronin', col: '#ffd23b', tint: '#ffe98a', hp: 104, spd: 1.08, pow: 1.06, reach: 0.96, weapon: 'katana', weaponArt: 'katana', build: { legLen: 0.94 }, meter: 1.30, shuri: 0, blurb: 'rubber-hose · big mitts', unlock: () => ({ ok: true }) },
    'cc0-mosh':   { name: 'BAD SIGNAL',   face: 'prizm', col: '#ff2ad9', tint: '#ff8ae0', hp: 84,  spd: 1.34, pow: 0.88, reach: 0.94, weapon: 'tanto',  weaponArt: 'light',  build: { legLen: 1.06 }, meter: 1.46, shuri: 2, blurb: 'sliced · fastest, thinnest',  unlock: o => ({ ok: o.rank >= 3, need: 'a MYTHIC+ card' }) },
    'cc0-cel':    { name: 'HEAVY LINE',   face: 'oni',   col: '#2bff80', tint: '#7fffb8', hp: 132, spd: 0.86, pow: 1.22, reach: 0.88, weapon: 'tanto',  weaponArt: 'club',   build: { legLen: 0.74 }, meter: 0.92, shuri: 0, blurb: 'smol · keylined · immovable', unlock: o => ({ ok: o.count >= 3, need: 'own 3 cards' }) },
    'cc0-grid':   { name: 'GRIDLOCK',     face: 'wojak', col: '#27f7e4', tint: '#8ff6ee', hp: 118, spd: 0.80, pow: 1.36, reach: 1.26, weapon: 'nodachi', weaponArt: 'nodachi', build: {},              meter: 0.88, shuri: 0, blurb: 'lattice · longest reach',   unlock: o => ({ ok: o.has('GAS STORM'), need: 'a GAS STORM card' }) },
    'cc0-lank':   { name: 'LONG ODDS',    face: 'ronin', col: '#9fd8b8', tint: '#c8f0dc', hp: 82,  spd: 1.22, pow: 0.90, reach: 1.30, weapon: 'nodachi', weaponArt: 'sickle', build: { legLen: 1.16 }, meter: 1.24, shuri: 1, blurb: 'all limb · glass reach',    unlock: o => ({ ok: o.count >= 1, need: 'own any card' }) },
    'cc0-squat':  { name: 'HOUSE EDGE',   face: 'oni',   col: '#ff6b57', tint: '#ffa08f', hp: 136, spd: 0.84, pow: 1.30, reach: 0.86, weapon: 'tanto',  weaponArt: 'club',   build: { legLen: 0.76 }, meter: 0.84, shuri: 0, blurb: 'low · heavy · always wins',  unlock: o => ({ ok: o.rank >= 4, need: 'a PRIZM card' }) },
    'cc0-lump':   { name: 'BAD BEAT',     face: 'wojak', col: '#b47bff', tint: '#d9bcff', hp: 112, spd: 1.00, pow: 1.00, reach: 1.00, weapon: 'katana', weaponArt: 'katana', build: {},               meter: 1.38, shuri: 1, blurb: 'even everywhere · big meter', unlock: o => ({ ok: o.has('RUG WIND'), need: 'a RUG WIND card' }) },
  };
  const ARCH_KEYS = Object.keys(ARCH);
  function ownSummary() { const cards = ownedSlugs().map(s => bySlug.get(s)).filter(Boolean); let rank = 0; const tr = new Set();
    cards.forEach(c => { rank = Math.max(rank, RANK[c.rarity] || 0); if (c.trigger) tr.add(String(c.trigger).toUpperCase()); });
    return { count: cards.length, rank, has: t => tr.has(t) }; }
  function unlocked() { const o = ownSummary(); const out = {}; ARCH_KEYS.forEach(k => out[k] = ARCH[k].unlock(o)); return out; }

  const WEAP_REACH = { katana: 1.0, tanto: 0.82, nodachi: 1.32 };

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * ⛔ FRAME DATA — THE ONE SOURCE. docs/RONIN-COMBAT.md carries the published table;
   *    `npm run test:ronin` parses that markdown, reads THIS object out of the live page, and
   *    fails if a single cell differs. The lobby's move list and the in-fight readout are
   *    rendered from it too, so there is exactly one place a number can be wrong.
   *    (CLAUDE.md / ROADMAP §5.4 — two copies of a fact will diverge; derive it or assert it.)
   *
   * ⚑ THE LOAD-BEARING NUMBER IS THE JAB AT i10 — 167 ms.
   *   Everything else is measured against it. 10 frames is just under a human's reaction floor
   *   (~15 f / 250 ms), so a jab cannot be blocked on reaction, only anticipated — which is what
   *   makes it the smallest legal punish, and therefore what sets the whole ladder: a move at
   *   −10 loses to a jab, −15 to a roundhouse, −16 to a cut, −18 to a launcher and so to a
   *   juggle worth about a third of the bar. Every rung below lands EXACTLY on some move's
   *   startup. That is designed, not luck.
   *
   * ⛔ WHAT THIS REPLACED, because it is the reason the game had no depth:
   *   the old table was written in SECONDS and the fastest three moves started up in
   *   .02 / .035 / .05 s = 1.2 / 2.1 / 3.0 FRAMES. Nothing was reactable, nothing could be
   *   spaced, and there was NO BLOCKSTUN AT ALL — a blocked move left the defender free
   *   instantly while the attacker still had ~5 frames of recovery, identically for every move
   *   in the game. So "block" was a stance you held, not a decision you made, and a punish did
   *   not exist as a concept. `npm run test:ronin` asserts the jab is i10 and that blockstun is
   *   non-zero: both fail on the old build.
   *
   * FIELDS · st startup · ac active · rc recovery · bs blockstun · hs hitstun (all FRAMES @60)
   *   onBlock = bs − (ac−1) − rc      onHit = hs − (ac−1) − rc     ← DERIVED, never typed
   *   homing  a move that tracks a sidestep. A LINEAR move whiffs against one — that is the
   *           entire reason the third axis exists, and it is asserted both ways.
   *   launch / knockdown / bound / chLaunch / grab / juggle  see docs/RONIN-COMBAT.md §4–6.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */
  const FPS = 60, F = 1 / FPS;
  const MOVES = {
    punch:   { name: 'JAB',           input: 'J · MMB',   st: 10, ac: 2,  rc: 12, dmg: 6,  bs: 10, hs: 18, reach: 44, kind: 'punch', knock: 90,  homing: true,  meter: 0.05, note: 'the yardstick. i10, −3, and the only thing that punishes a −10.' },
    kick:    { name: 'ROUNDHOUSE',    input: 'K · RMB',   st: 15, ac: 3,  rc: 20, dmg: 13, bs: 16, hs: 26, reach: 58, kind: 'kick',  knock: 250, homing: false, meter: 0.07, chLaunch: true, note: 'linear — a sidestep eats it. LAUNCHES on counter-hit.' },
    slash:   { name: 'OVERHEAD CUT',  input: 'L · LMB',   st: 16, ac: 3,  rc: 25, dmg: 17, bs: 17, hs: 30, reach: 66, kind: 'slash', knock: 160, homing: false, meter: 0.08, juggle: true, note: 'your damage. −10 means a blocked cut is a free jab for them.' },
    rising:  { name: 'RISING KICK',   input: 'S+K',       st: 18, ac: 3,  rc: 36, dmg: 14, bs: 18, hs: 0,  reach: 56, kind: 'kick',  knock: 120, homing: false, meter: 0.05, launch: true, note: 'THE launcher. −20: whiff or get it blocked and you eat a juggle.' },
    grab:    { name: 'NECK THROW',    input: 'G',         st: 12, ac: 2,  rc: 30, dmg: 24, bs: 0,  hs: 0,  reach: 40, kind: 'throw', knock: 300, homing: true,  meter: 0.06, grab: true, note: 'beats block, loses to a sidestep. 20-frame break window.' },
    dragon:  { name: 'DRAGON KICK',   input: 'P · K',     st: 18, ac: 3,  rc: 34, dmg: 20, bs: 18, hs: 0,  reach: 62, kind: 'kick',  knock: 300, homing: false, meter: 0.09, launch: true, note: 'the string launcher — same −18 price as the button one.' },
    crest:   { name: 'CREST WAVE',    input: 'P · K · S', st: 20, ac: 4,  rc: 33, dmg: 26, bs: 20, hs: 0,  reach: 88, kind: 'slash', knock: 260, homing: true,  meter: 0.10, knockdown: true, bound: true, note: 'the BOUND. Slams a juggled foe into the floor for one extension.' },
    tempest: { name: 'TEMPEST',       input: 'S · S · S', st: 24, ac: 6,  rc: 40, dmg: 30, bs: 22, hs: 0,  reach: 92, kind: 'slash', knock: 240, homing: true,  meter: 0.12, knockdown: true, note: 'the most committal move in the game: −23, so it is launch-punishable.' },
    special: { name: 'BLADE NOVA',    input: 'SPACE',     st: 8,  ac: 10, rc: 30, dmg: 26, bs: 24, hs: 0,  reach: 110, kind: 'slash', knock: 320, homing: true, meter: 0, knockdown: true, invuln: 14, note: 'costs the whole meter · invulnerable frames 1–14 · still −15.' },
  };
  /* DERIVED, so the doc and the code cannot disagree about advantage even if someone retunes a
   * recovery. A move that puts the target on the floor has no on-hit number by definition. */
  const MOVE_IDS = Object.keys(MOVES);
  for (const id of MOVE_IDS) { const m = MOVES[id]; m.id = id;
    m.onBlock = m.grab ? null : m.bs - (m.ac - 1) - m.rc;
    m.onHit = (m.grab || m.launch || m.knockdown) ? null : m.hs - (m.ac - 1) - m.rc;
    m.total = m.st + m.ac + m.rc;
    m.stS = m.st * F; m.acS = m.ac * F; m.rcS = m.rc * F;
    /* ⚑ THE CONVENTION, WRITTEN DOWN, because a fighting game is one long off-by-one and the
     * measurement cannot check the table unless both agree on what a frame IS.
     *   · a move's frame 1 is the frame it was input on (`stT` is 0 during that frame).
     *   · "i10" means it HITS ON FRAME 10 — frames 1–9 are startup      → hitS = (st−1)/60
     *   · it stays active for `ac` frames, frames st … st+ac−1
     *   · after contact the attacker still owes (ac−1) active + rc recovery frames, so it is
     *     actionable on frame st+ac+rc−1                                → endS = (st+ac+rc−2)/60
     *   · the defender is locked for exactly `bs` frames from contact, actionable on st+bs
     *   subtract:  adv = (st+bs) − (st+ac+rc−1) = bs − (ac−1) − rc      ← the standard formula
     * ⛔ It falls out of this that an i-N move punishes a deficit of exactly −N and NOT −(N−1).
     * That exactness is the whole ladder, and `npm run test:ronin` proves it by driving the
     * punisher one rung too slow and requiring it to WHIFF. Move any of these three constants by
     * one frame and that negative control fails, which is precisely what it is for. */
    m.hitS = (m.st - 1) * F; m.endS = (m.st + m.ac + m.rc - 2) * F; }
  // ordered by startup — the punish ladder is read off this, never hand-listed
  const BY_STARTUP = MOVE_IDS.filter(id => !MOVES[id].grab).sort((a, b) => MOVES[a].st - MOVES[b].st);
  /* Which moves punish a given block, by the only rule there is: a punisher lands iff its
   * startup fits inside the deficit. `special` is excluded — it costs a full meter, so listing
   * it as "the punish" would be advice a player usually cannot take. */
  function punishersFor(id) { const m = MOVES[id]; if (!m || m.onBlock == null || m.onBlock >= 0) return [];
    return BY_STARTUP.filter(p => p !== 'special' && MOVES[p].st <= -m.onBlock); }

  /* ── JUGGLE ────────────────────────────────────────────────────────────────────────────────
   * Three things terminate a combo, and all three are needed: damage scaling makes a long one
   * not worth it, float decay makes it physically impossible, and the floor is invulnerable so
   * there is no loop back into a new launcher. `npm run test:ronin` drives the greediest juggle
   * a human could input and asserts hits, airtime and total damage are all bounded. */
  const JSCALE = [1, 0.80, 0.68, 0.58, 0.50, 0.42, 0.35, 0.30, 0.25];
  /* ⚑ THESE THREE NUMBERS WERE DERIVED FROM THE FRAME TABLE, NOT PICKED. The launcher's own
   * recovery is 36 frames and the fastest follow-up is i10, so the first juggle hit cannot land
   * sooner than 38+9 = 47 frames after the launch — meaning a hang time under ~50 frames makes a
   * "launcher" that no move in the game can follow up. At 700/560 the hang was 96 frames and only
   * ONE follow-up connected. At 560/620 it is 133, which fits four.
   * ⛔ And the FLOOR of REFLOAT is what stops it being infinite: a jab's contact-to-contact cycle
   * is (ac+rc−1)+(st−1) = 22 frames, so once a re-float buys less than 22 frames of air the loop
   * cannot close. 60 buys 13. That is why the floor is 60 and not a rounder number. */
  const JUG_G = 620;            // juggle gravity — a THIRD of the 1750 a jump uses
  const LAUNCH_V = 540;         // ≈ 1.74 s of hang at JUG_G, apex ≈ 235 px
  const REFLOAT = n => Math.max(50, 280 - 55 * n);   // each juggle hit lifts them less
  /* ⛔ AND A HARD CAP, because decay alone does NOT terminate a juggle and the test proved it.
   * Re-float adds upward velocity from wherever the body already IS — it does not reset the
   * height — so a fighter pumped up to the apex keeps enough hang time for a 22-frame jab cycle
   * to reconnect on the way down. Driven greedily that ran SIXTEEN jabs over 8.6 s, terminating
   * only when they finally sank below the jab. Scaling had already made it nearly worthless
   * (1.5 damage a hit), which is exactly the trap: it LOOKED bounded because the damage was.
   * Past the cap a hit no longer floats — it spikes them at the floor. */
  const JUG_MAX = 5, JUG_SPIKE = 620;
  const BOUND_V = 900, BOUND_BOUNCE = 250;
  const DOWN_F = 22, GETUP_F = 16;   // on the floor, then standing up — invulnerable throughout
  const THROW_BREAK = 20, THROW_HOLD = 30;  // break window · frames until the throw resolves
  const SSTEP = { st: 3, ev: 12, rc: 7, dz: 78 };    // sidestep: 3 + 12 evade + 7 = 22 frames
  const HP_SCALE = 1.8;
  /* ⚑ WHY HP WENT UP. A round has to hold enough openings that learning a punish pays. At the
   * old 100 HP a launch-punish juggle (~55) was 55% of the bar — one read ended the round, so
   * nobody would ever experiment. At 180 the same juggle is ~31%: three openings to a round,
   * which is the shape Tekken actually has. Damage numbers are unchanged in the table above;
   * only the denominator moved, and `npm run test:ronin` prints the resulting round length. */

  // ── game state ──
  const wager = { ante: 50, cards: 2, players: 2, arch: 'ronin', picked: [] };   // NEON RONIN is a 1v1 duel
  let G = null, keys = {}, touch = { mx: 0, mz: 0, jump: false, block: false }, running = false, last = 0, glowT = 0;
  let cardPow = 1, cardHpMul = 1, cardSpd = 1;
  const idc = () => Math.random().toString(36).slice(2, 8);

  function mkFighter(archKey, x, isMe, name) {
    const a = ARCH[archKey] || ARCH.ronin;
    const hp = Math.round(a.hp * HP_SCALE * (isMe ? cardHpMul : 1));
    return { id: idc(), arch: archKey, a, name: name || a.name, isMe: !!isMe, x, yLift: 0, vx: 0, vy: 0, air: false,
      face: isMe ? 1 : -1, maxHp: hp, hp, meter: 0, state: 'idle', stT: 0, walkPh: rnd(0, 6.28), swing: null,
      // ── frame-data state. Every one of these gates `canAct` and nothing else does. ──
      bstun: 0, juggle: null, grab: null, thrown: null, downT: 0, step: null, ch: 0,
      blockedRun: 0, minus: null, aiBreakAt: null, buf: null, guardT: 0,
      combo: 0, comboT: 0, stun: 0, invuln: 0.6, col: a.col, tint: a.tint, weapon: a.weapon,
      rage: 0, glow: 0, shuri: a.shuri, kos: 0, dead: false, deadT: 0, ragdoll: false, koDir: 1, aiT: rnd(0.2, 0.7), aiMove: 0,
      pow: a.pow * (isMe ? cardPow : rnd(0.85, 1.12)), spd: a.spd * (isMe ? cardSpd : rnd(0.9, 1.08)),
      // spring-driven skeleton — every channel has value+velocity so limbs carry momentum,
      // overshoot their target pose, and flail on impact (the Soul-Calibur weight). trail = blade tip streak.
      rig: { lean: 0, leanV: 0, head: 0, headV: 0, aF: -0.6, aFV: 0, eF: 0.5, eFV: 0, aB: 0.6, aBV: 0, eB: 0.5, eBV: 0,
        hF: 0.15, hFV: 0, kF: 0, kFV: 0, hB: -0.15, hBV: 0, kB: 0, kBV: 0, sw: 2.5, swV: 0, bob: 0, bobV: 0, bodyRot: 0, bodyRotV: 0 },
      z: 0, zv: 0, spin: 0, spinT: 0, trail: [] };   // NOTE: f.w (world position) is added ONLY in
                                                     // world mode — its presence is what switches
                                                     // the renderer to world placement.
  }

  function startBrawl(real, forceMe, forceFoe) {
    cardPow = cardHpMul = cardSpd = 1;
    try { if (window.RipPowers && wager.picked.length) { const L = RipPowers.loadout(wager.picked.map(sl => bySlug.get(sl)).filter(Boolean), RipPowers.getMarket());
      cardPow = 1 + Math.min(0.35, (L.dmg - 1)); cardHpMul = 1 + Math.min(0.4, (L.shield || 0) / 30); cardSpd = 1 + Math.min(0.12, (L.speed - 1)); } } catch {}
    worldW = Math.max(1200, W * 1.5);
    const N = 2;
    const fighters = [];
    // me — centred-left
    const meArch = forceMe && ARCH[forceMe] ? forceMe : wager.arch;
    const me = mkFighter(meArch, worldW * 0.42, true, myHandle().slice(0, 10));
    me.face = 1; fighters.push(me);
    // LENS: the card you bring warps your fighter's body — a seeded, permanent iteration per slug
    try { const lensSlug = wager.picked[0] || ownedSlugs()[0];
      if (lensSlug && r3dOk && window.Ronin3D && Ronin3D.setMorphVariant) {
        const id = meArch + ':' + lensSlug;
        if (Ronin3D.setMorphVariant(id, lensSlug)) { me.morphId = id; me.lens = lensSlug; }
      } } catch (e) {}
    // the rival — a DIFFERENT archetype so the duel reads as two distinct fighters
    const others = ARCH_KEYS.filter(k => k !== meArch);
    const rivalArch = (forceFoe && ARCH[forceFoe]) ? forceFoe : (others[Math.floor(Math.random() * others.length)] || 'oni');
    const names = { ronin: 'RONIN', kappa: 'KAPPA', doomer: 'DOOMER', oni: 'ONI', kunoichi: 'KUNOICHI', prizm: 'PRIZMANCER' };
    const rival = mkFighter(rivalArch, worldW * 0.58, false, names[rivalArch] || 'RIVAL'); rival.face = -1; fighters.push(rival);
    G = { mode: 'play', t: 0, fighters, me, foe: rival, pickups: [], fx: [], pops: [], cam: { x: clamp((me.x + rival.x) / 2 - W / 2, 0, Math.max(0, worldW - W)) },
      timeLeft: 90, hitstop: 0, shake: 0, order: [], real: !!real, started: false, myStake: wager.picked.slice(), oppStakes: [], koFeed: 0 };
    { const st = []; for (let k = 0; k < wager.cards; k++) { const all = [...bySlug.keys()]; if (all.length) st.push(all[Math.floor(Math.random() * all.length)]); } G.oppStakes.push(st); }
    // a couple of power-up crates around the ring
    for (let i = 0; i < 2; i++) dropPickup(rnd(worldW * 0.3, worldW * 0.7), null);
    $('hud').classList.remove('hidden'); $('ovLobby').classList.remove('show'); $('ovResult').classList.remove('show');
    $('myName').textContent = me.name.toUpperCase(); $('foeName').textContent = rival.name.toUpperCase(); $('foeKos').textContent = '';
    if (window.RipNet) { try { RipNet.setStatus('battling'); } catch {} }
    // 3-2-1
    let n = 3; $('cd').classList.remove('hidden'); $('cdB').textContent = n; sfxGong();
    const iv = setInterval(() => { n--; if (n > 0) { $('cdB').textContent = n; sfxGong(); }
      else if (n === 0) { $('cdB').textContent = 'FIGHT'; sfxGong(); }
      else { clearInterval(iv); $('cd').classList.add('hidden'); G.started = true; } }, 700);
    // drop both fighters into the city if a world is loaded
    if (window.RoninWorld && RoninWorld.world) { G.worldMode = true; G.camYaw = 0;
      // Authored spawns first (kit.spawn → bake-world → cols.json); the search is the fallback
      // for levels that carry none. The old hard-coded hints (0,-4)/(8,-10) were tuned for the
      // street scene and mean nothing in a level built to a different plan.
      const aA = RoninWorld.pickSpawn && RoninWorld.pickSpawn(null);
      const aB = aA && RoninWorld.pickSpawn(aA);
      const sA = aA || RoninWorld.findSpawn(0, -4);
      const sB = (aB && aB !== aA) ? aB : RoninWorld.findSpawn(sA.x + 8, sA.z - 6);
      me.w = { x: sA.x, y: sA.y + 0.2, z: sA.z, vx: 0, vy: 0, vz: 0, onGround: true, boost: 1 };
      rival.w = { x: sB.x, y: sB.y + 0.2, z: sB.z, vx: 0, vy: 0, vz: 0, onGround: true, boost: 1 };
      toast('EXPLORE · WASD run · SHIFT sprint · SPACE jump/boost · Q/E turn'); }
    last = performance.now(); if (!running) { running = true; requestAnimationFrame(loop); }
  }

  // ── pickups ──
  const PTYPES = { heal: { c: '#2bff80', g: '❤' }, shuri: { c: '#8ffff0', g: '✷' }, glow: { c: '#ff2ad9', g: '⚔' }, rage: { c: '#ff6b57', g: '⚡' } };
  function dropPickup(x, from) { const kinds = ['heal', 'shuri', 'glow', 'rage']; const type = kinds[Math.floor(Math.random() * kinds.length)];
    G && G.pickups.push({ x, y: from ? -20 : 0, vy: from ? -180 : 0, type, bob: rnd(0, 6.28), t: 0 }); }

  // ── combat ──
  // ── special combos: recent attack strings unlock named finishers ──
  function pushSeq(f, kind) { const now = G ? G.t : 0; f.seq = (f.seq || []).filter(s => now - s.t < 1.1); f.seq.push({ k: kind, t: now }); if (f.seq.length > 5) f.seq.shift(); }
  function detectCombo(f) { const s = (f.seq || []).map(x => x.k), n = s.length;
    if (n >= 3 && s[n - 1] === 'slash' && s[n - 2] === 'slash' && s[n - 3] === 'slash') return 'tempest';        // slash·slash·slash → spinning nova cut
    if (n >= 3 && s[n - 1] === 'slash' && s[n - 2] === 'kick' && s[n - 3] === 'punch') return 'crest';           // punch·kick·slash → sweeping crest
    if (n >= 2 && s[n - 1] === 'kick' && s[n - 2] === 'punch') return 'dragon';                                  // punch·kick → launcher
    return null; }
  function comboFx(f, move) { if (f.isMe) toast(MOVES[move].name); flash(f.tint || '#e6c8ff', 0.3); G.shake = Math.max(G.shake, 8);
    { const cy = groundY - 150; pop(4, f.x, cy, { col: f.tint || '#ffe14d', size: 1.1, grow: 1.6, life: 0.42 });   // combo-name burst + radiating lines
      for (let i = 0; i < 6; i++) { const an = i / 6 * 6.28 + 0.3; pop(1, f.x + Math.cos(an) * 54, cy + Math.sin(an) * 34, { col: '#ffffff', size: 0.55, rot: an + 1.57, grow: 0.9, life: 0.28, a: 0.85 }); } }
    triggerShock(f.x + f.face * 24, groundY - 116, 1.2);
    G.fx.push({ kind: 'arc', x: f.x + f.face * 20, y: groundY - 116, face: f.face, r: 158, a0: -2.7, a1: 1.05, col: f.tint || '#eaf6ff', t: 0, life: 0.32 });   // oversized signature crescent
    sfxSpecial(); }

  /* ⛔ ONE definition of "can this fighter act". Everything that takes a turn away — recovery,
   * blockstun, hitstun, being thrown, lying on the floor, standing back up, the sidestep's own
   * recovery — is gated HERE and nowhere else, because a second copy of this rule is how a
   * mechanic silently stops mattering. `framesUntilFree` is the same question asked in frames,
   * and it is what makes advantage MEASURABLE rather than merely tabulated. */
  /* ⚠ `< EPS`, NOT `<= 0`. A timer set to 10 frames and decremented ten times by 1/60 does not
   * land on zero in binary floating point — it lands on ~2.8e-17, which is > 0, so the fighter
   * stayed locked for ONE MORE FRAME. That is not a rounding curiosity here: one frame IS the
   * punish ladder, and it made every measured advantage exactly 1 worse than the published one
   * and an i10 punisher fail against a −10. Timers only ever step by whole frames, so half a
   * frame is the right tolerance: it cannot free anyone early and it cannot leave residue. */
  const EPS = F * 0.5;
  /* Who is holding the controller. `forceAI` lets the harness hand the PLAYER's fighter to the
   * same stepAI the rival uses, which is the only way to measure a match where both sides play
   * the new system — a standing player would make any "the bots cope" number meaningless. */
  const PLAYED = f => f.isMe && !f.forceAI;
  function canAct(f) { return !!f && !f.dead && !f.swing && !f.grab && !f.thrown && !f.step
    && f.stun < EPS && f.bstun < EPS && f.downT < EPS && f.state !== 'down' && f.state !== 'getup'; }
  function framesUntilFree(f) {
    if (!f || f.dead) return 0;
    let s = Math.max(f.stun, f.bstun, f.downT);
    if (f.swing) s = Math.max(s, f.swing.mv.endS - f.stT);
    if (f.step) s = Math.max(s, (SSTEP.st + SSTEP.ev + SSTEP.rc - 1) * F - f.stT);
    if (f.grab) s = Math.max(s, THROW_HOLD * F - f.grab.t);
    if (f.thrown) s = Math.max(s, THROW_HOLD * F - f.thrown.t);
    return Math.max(0, s) * FPS;
  }

  function startMove(f, id) {
    const mv = MOVES[id]; if (!mv) return false;
    f.state = mv.kind === 'punch' ? 'punch' : mv.kind === 'kick' ? 'kick' : mv.kind === 'throw' ? 'throw' : (id === 'special' ? 'special' : 'slash');
    f.move = id; f.stT = 0; f.bstun = 0;
    f.swing = { mv, hits: new Set(), arced: false };
    if (mv.invuln) f.invuln = Math.max(f.invuln, mv.invuln * F);
    if (id === 'tempest') f.spinT = 0.4; else if (id === 'special') f.spinT = 0.55;
    if (mv.kind === 'slash') sfxSlash(); else sfxWhiff();
    return true;
  }
  /* Input → move. The three attack buttons stay exactly where they were; what changed is that
   * `S + KICK` is now the direct LAUNCHER, so a launch punish is one input rather than a lucky
   * state of the string buffer. The strings (P·K, P·K·S, S·S·S) are untouched. */
  function fireAttack(f, kind, low) {
    if (kind === 'kick' && low) { f.seq = []; return startMove(f, 'rising'); }    // S+K → RISING KICK
    pushSeq(f, kind);
    const move = detectCombo(f);
    if (move) { f.seq = []; startMove(f, move); comboFx(f, move); return true; }
    return startMove(f, kind);
  }
  const buffer = (f, entry) => { if (f.thrown || f.downT > 0 || f.state === 'down' || f.state === 'getup') return;
    f.buf = Object.assign({ t: 0 }, entry); };
  function tryAttack(f, kind, opt) {
    if (f.dead) return;
    if (f.thrown) { tryBreak(f); return; }                    // the same buttons break a throw
    if (!MOVES[kind]) return;
    const low = !!(opt && opt.low);
    if (!canAct(f)) { buffer(f, { kind, low }); return; }
    fireAttack(f, kind, low);
  }
  function tryThrow(f) { if (f.dead) return; if (f.thrown) { tryBreak(f); return; }
    if (!canAct(f)) { buffer(f, { id: 'grab' }); return; } startMove(f, 'grab'); }
  function tryJump(f) { if (f.dead || f.air || !canAct(f)) return; if (f.state === 'block') f.state = 'idle';
    f.vy = -480; f.air = true; }
  /* ── SIDESTEP — the third axis, as a MOVE with its own frame data ──────────────────────────
   * The analogue Q/E strafe is still there for spacing. This is the committed version: 3 frames
   * of startup, 12 EVADE frames during which a LINEAR move passes through you, 7 of recovery.
   * That asymmetry is the whole point of z existing — and `npm run test:ronin` proves it both
   * ways, because "it dodged" is a weak question that a lucky whiff also passes. */
  function trySidestep(f, dir) { if (f.dead || f.air || !canAct(f) || (f.stepCd || 0) > 0) return;
    f.step = { dir, t: 0 }; f.state = 'sidestep'; f.stT = 0; f.stepCd = 0.30;
    f.zGoal = clamp((f.z || 0) + dir * SSTEP.dz, -110, 110);
    spawnDust(f.x, 3);
    for (let i = 0; i < 3; i++) pop(1, f.x + rnd(-18, 18), groundY - 80 - rnd(0, 50), { col: '#cfe6ff', size: 0.42, rot: 0, grow: 0.5, life: 0.18, a: 0.7 }); }
  function evading(f) { return !!f.step && f.stT >= SSTEP.st * F && f.stT < (SSTEP.st + SSTEP.ev) * F; }
  // quick ground dash (double-tap a direction) — a burst of speed + brief i-frames for agility
  function tryDash(f, dir) { if (f.dead || !canAct(f) || f.air || (f.dashCd || 0) > 0) return;
    f.vx = dir * 760 * f.spd; f.face = dir; f.invuln = Math.max(f.invuln, 0.16); f.dashCd = 0.42; f.state = 'walk';
    f.rig.lean += dir * f.face * 0.12; spawnDust(f.x - dir * 12, 4); sfxWhiff();
    for (let i = 0; i < 4; i++) pop(1, f.x - dir * (26 + i * 16), groundY - 70 - rnd(0, 60), { col: '#cfe6ff', size: 0.5, rot: 1.57, grow: 0.5, life: 0.2, a: 0.8 }); }   // dash speed-lines
  function checkDash(f, dir) { const now = G ? G.t : 0; if (f._tapDir === dir && now - (f._tapT || -9) < 0.24) { tryDash(f, dir); f._tapT = -9; } else { f._tapDir = dir; f._tapT = now; } }
  function tryShuri(f) { if (f.dead || f.shuri <= 0 || !canAct(f) || f.air) return; f.shuri--;
    G.fx.push({ kind: 'shuri', x: f.x + f.face * 22, y: 0, vx: f.face * 520, side: f.id, dmg: 8 * f.pow, spin: 0 });
    sfxShuri(); if (f.isMe) updShuri(); }
  /* The meter nova is now a MOVE like any other — it has startup you can be counter-hit out of,
   * and it is −15 on block. It used to hit everything within 200 px the instant the key went
   * down, with no startup at all, which made a full meter an unanswerable button. */
  function trySpecial(f) { if (f.dead || f.meter < 1 || !canAct(f)) return; f.meter = 0;
    startMove(f, 'special');
    G.shake = Math.max(G.shake, 10); flash('#e6c8ff', 0.5); triggerShock(f.x, groundY - 116, 1.6); cineKick(0.85, f.face); sfxSpecial();
    if (f.isMe) updMeter(); }

  // ── THROWS ────────────────────────────────────────────────────────────────────────────────
  /* A throw is the answer to a player who never stops blocking, so it ignores guard entirely.
   * Its price is that it is the only move in the game that can be REFUSED after it lands: 20
   * frames (333 ms) to press punch or kick. Inside the window it costs the thrower 2 frames;
   * outside it costs the thrown 24 and a knockdown. Both halves are asserted. */
  function startThrow(att, tgt) {
    att.grab = { tgt, t: 0, broken: false }; att.state = 'grab'; att.stT = 0; att.swing = null;
    tgt.thrown = { by: att, t: 0 }; tgt.state = 'thrown'; tgt.stT = 0; tgt.swing = null; tgt.step = null;
    tgt.vx = 0; tgt.bstun = 0; tgt.stun = 0;
    tgt.x = att.x + att.face * 46; tgt.face = -att.face; tgt.z = att.z;
    sfxHit(false); G.shake = Math.max(G.shake, 4);
    pop(2, tgt.x, groundY - 150, { col: '#ffd23b', size: 0.7, life: 0.4 });
    /* The prompt is the reason the break window is a mechanic rather than a trap: a 333 ms
     * window nobody is told about is just damage. Both sides are told, and told different
     * things — the thrower is not the one who should be mashing. */
    if (tgt.isMe) showFrames('THROWN · MASH P/K — ' + THROW_BREAK + 'f TO BREAK', THROW_BREAK, 'warn');
    else if (att.isMe) showFrames('THROW · they have ' + THROW_BREAK + 'f to break', THROW_BREAK, 'good');
  }
  function tryBreak(f) {
    const th = f.thrown; if (!th) return false;
    if (th.t >= THROW_BREAK * F - F * 0.5) return false;      // too late — the window is closed
    const att = th.by;
    f.thrown = null; f.state = 'idle'; f.stT = 0; f.stun = 0;
    if (att) { att.grab = null; att.state = 'idle'; att.stT = 0; att.stun = 2 * F; }   // thrower ends at −2
    f.vx = -f.face * 220; if (att) att.vx = att.face * -220;
    spark(f.x, groundY - 116, '#8ffff0'); sfxBlock(); G.shake = Math.max(G.shake, 5);
    pop(4, f.x, groundY - 130, { col: '#8ffff0', size: 0.9, grow: 1.2, life: 0.32 });
    if (f.isMe || (att && att.isMe)) showFrames('THROW BROKEN · ' + Math.round(th.t * FPS) + 'f', null, 'good');
    return true;
  }
  function finishThrow(att) {
    const g = att.grab; if (!g) return; const tgt = g.tgt; att.grab = null; att.state = 'idle'; att.stT = 0;
    if (!tgt || !tgt.thrown) return;
    tgt.thrown = null;
    const mv = MOVES.grab, dmg = mv.dmg * att.pow * (att.rage > 0 ? 1.3 : 1);
    tgt.hp -= dmg; att.meter = Math.min(1, att.meter + mv.meter * att.a.meter);
    tgt.state = 'hurt'; tgt.stT = 0; tgt.stun = 1.2; tgt.vx = att.face * mv.knock; tgt.vy = -300; tgt.air = true;
    startJuggle(tgt); tgt.juggle.hits = 4; tgt.juggle.bound = false;   // a throw ends in a knockdown, not a combo
    impulse(tgt, att.face, 1.6, true); popImpact(tgt.x, groundY - 116, '#ffd23b', true);
    G.hitstop = Math.max(G.hitstop, 0.12); G.shake = Math.max(G.shake, 10); sfxKo();
    if (att.isMe || tgt.isMe) showFrames('THROW · ' + Math.round(dmg) + ' · KND', null, 'bad');
    if (tgt.hp <= 0) ko(tgt, att);
  }

  function activeHit(f) {
    const sw = f.swing; if (!sw) return; const mv = sw.mv;
    // active on frames st … st+ac−1, i.e. stT in [hitS, hitS+(ac−1)/60]
    if (f.stT < mv.hitS - F * 0.5 || f.stT > mv.hitS + (mv.ac - 1) * F + F * 0.5) return;
    const reach = (mv.reach * f.a.reach * (WEAP_REACH[f.weapon] || 1)) * 1.5 * BODY + (f.glow > 0 && mv.kind === 'slash' ? 30 : 0);   // scaled to the bigger bodies
    const hx = f.x + f.face * (26 + reach * 0.5), hy = groundY - 116 - f.yLift;
    G.fighters.forEach(t => {
      if (t === f || t.dead || sw.hits.has(t.id) || t.invuln > 0 || t.thrown) return;
      const onSide = f.spinT > 0 || Math.sign(t.x - f.x) === f.face || Math.abs(t.x - f.x) < 20;   // a spin hits both sides
      const near = Math.abs(t.x - hx) < reach * 0.6 + 20;
      const vClose = Math.abs((t.yLift) - (f.yLift)) < (t.juggle ? 420 : 60);   // a juggle follow-up must reach UP
      /* ⛔ THE HOMING RULE. A LINEAR move needs the target on the fight line; a HOMING move does
       * not care where they stepped. This one line, plus `evading`, is the entire reason the
       * third axis is a defence rather than decoration. */
      const zClose = mv.homing || Math.abs((t.z || 0) - (f.z || 0)) < 58;
      const dodged = !mv.homing && evading(t);
      if (mv.grab && (t.air || t.yLift > 6 || t.juggle)) return;   // you cannot throw someone in the air
      if (onSide && near && vClose && zClose && !dodged) { sw.hits.add(t.id); resolveHit(f, t, mv, hx, hy); }
      else if (dodged && (f.isMe || t.isMe)) { showFrames(mv.name + ' SIDESTEPPED · ' + mv.rc + 'f RECOVERY', null, 'good'); sw.hits.add(t.id); }
    });
  }
  function resolveHit(att, tgt, mv, hx, hy) {
    const dir = Math.sign(tgt.x - att.x) || att.face;
    if (mv.grab) { startThrow(att, tgt); return; }             // throws ignore guard by definition
    const blocking = tgt.state === 'block' && Math.sign(att.x - tgt.x) === tgt.face && !tgt.air && !tgt.juggle;
    const mul = att.pow * (att.rage > 0 ? 1.3 : 1) * (att.glow > 0 && mv.kind === 'slash' ? 1.4 : 1);
    if (blocking) {
      const chip = mv.dmg * 0.12 * mul; tgt.hp -= chip; tgt.vx += dir * mv.knock * 0.28;
      tgt.bstun = mv.bs * F; tgt.state = 'block'; tgt.blockedRun = (tgt.blockedRun || 0) + 1;
      att.minus = { id: mv.id, adv: mv.onBlock, t: G.t };      // …and so does the attacker
      att.blockedRun = 0;
      att.meter = Math.min(1, att.meter + mv.meter * 0.4); tgt.meter = Math.min(1, tgt.meter + 0.05);
      spark(hx, hy, '#8ffff0'); sfxBlock(); G.shake = Math.max(G.shake, 2);
      pop(0, hx, hy, { col: '#8ffff0', size: 0.42, rot: rnd(0, 6.28), life: 0.22 }); pop(3, tgt.x + tgt.face * -14, hy - 56, { col: '#bfefff', size: 0.34, life: 0.4 });   // guard clink + sweat
      if (att.isMe || tgt.isMe) reportBlock(att, tgt, mv);
      if (att.isMe) updMeter(); return;
    }
    /* COUNTER HIT — landing inside the opponent's own move. Tekken's rule verbatim: any part of
     * their animation counts, startup, active or recovery. It is worth 30% more, eight extra
     * frames of hitstun, and it is the ONLY way a ROUNDHOUSE launches. */
    const counter = !!tgt.swing || !!tgt.step;
    const juggling = !!tgt.juggle && (tgt.air || tgt.yLift > 4);
    let dmg = mv.dmg * mul;
    if (counter) dmg *= 1.3;
    if (juggling) dmg *= JSCALE[Math.min(tgt.juggle.hits, JSCALE.length - 1)];
    tgt.hp -= dmg;
    tgt.swing = null; tgt.step = null; tgt.bstun = 0; tgt.blockedRun = 0; att.blockedRun = 0;
    att.combo++; att.comboT = 1.3; att.meter = Math.min(1, att.meter + mv.meter * att.a.meter); tgt.meter = Math.min(1, tgt.meter + 0.03);
    tgt.ch = counter ? 0.35 : 0;
    const launches = !!mv.launch || (counter && mv.chLaunch);
    const knockdown = launches || !!mv.knockdown;
    tgt.state = 'hurt'; tgt.stT = 0;
    tgt.vx += dir * mv.knock * mul * (knockdown ? 1.3 : 1) * (juggling ? 0.12 : 1);   // a juggle keeps them overhead
    if (juggling) {                                            // ── a hit on an airborne, juggled foe
      const n = tgt.juggle.hits; tgt.juggle.hits = n + 1;
      if (mv.bound && tgt.juggle.bound && n >= 1) { tgt.juggle.bound = false; tgt.vy = BOUND_V; tgt.juggle.slam = true;
        if (att.isMe || tgt.isMe) showFrames('BOUND · FLOOR BREAK', null, 'bad'); }
      else if (n >= JUG_MAX) tgt.vy = JUG_SPIKE;             // combo over: this one puts them down
      else tgt.vy = -REFLOAT(n);
      tgt.air = true; tgt.stun = 1.2;                          // hitstun cannot expire mid-air
    } else if (launches) { startJuggle(tgt); tgt.vy = -LAUNCH_V; tgt.air = true; tgt.stun = 1.2;
      /* ⛔ A LAUNCH SENDS THEM UP, NOT AWAY — and this line is the difference between a launcher
       * and a knockdown with extra steps. With the ordinary knockback applied, a launched
       * opponent drifted ~100 px downrange during the launcher's own 36 frames of recovery, so
       * by the time the attacker could act the target was outside JAB range and NOT ONE
       * follow-up connected. The juggle existed in the code and never once happened. */
      tgt.vx = dir * 60; }
    else if (knockdown) { startJuggle(tgt); tgt.juggle.hits = 3; tgt.juggle.bound = false;   // a raw knockdown floats low and scales hard
      tgt.vy = -300; tgt.air = true; tgt.stun = 1.2; }
    else { tgt.stun = (mv.hs + (counter ? 8 : 0)) * F; }
    impulse(tgt, dir, clamp(0.55 + mul * 0.5, 0.5, 1.8), knockdown);
    const finisher = mv.knockdown || mv.launch;
    for (let i = 0; i < (counter ? 12 : knockdown ? 8 : 4); i++) spark(hx + rnd(-10, 10), hy + rnd(-12, 12), counter ? '#fff0b0' : att.tint);
    G.hitstop = Math.max(G.hitstop, finisher ? 0.13 : counter ? 0.10 : knockdown ? 0.11 : 0.055); G.shake = Math.max(G.shake, finisher ? 12 : knockdown ? 9 : 5);
    popImpact(hx, hy, counter ? '#fff0b0' : (att.tint || '#fff2a8'), !!finisher || knockdown || counter);      // manga impact star + speed lines
    if (knockdown) pop(2, tgt.x, hy - 66, { col: '#ff4fa3', size: 0.6, life: 0.42 });                 // "!" over a knockdown
    if (knockdown || counter) { triggerShock(hx, hy, finisher ? 1.5 : 1); cineKick(finisher ? 0.72 : 0.36, dir); }
    sfxHit(knockdown); if (att.isMe) { bumpCombo(att.combo); updMeter(); }
    if (att.isMe || tgt.isMe) reportHit(att, tgt, mv, dmg, counter, launches, juggling);
    if (tgt.hp <= 0) ko(tgt, att);
  }
  function startJuggle(f) { f.juggle = { hits: 0, bound: true, dmg0: f.hp, t: 0 }; }
  /* ⛔ THE FLOOR IS THE TERMINATOR. Landing out of a juggle puts you down for 22 frames and then
   * stands you up over 16 more, invulnerable throughout, so a combo cannot loop back into a new
   * launcher. Grounded hits are deliberately out of scope — see docs/RONIN-COMBAT.md §5. */
  function land(f) {
    const wasJug = !!f.juggle; f.juggle = null;
    if (wasJug || f.state === 'hurt') { f.state = 'down'; f.stT = 0; f.downT = DOWN_F * F;
      f.invuln = Math.max(f.invuln, (DOWN_F + GETUP_F) * F); f.stun = 0; spawnDust(f.x, 6); }
  }
  function ko(tgt, killer) { if (tgt.dead) return; tgt.dead = true; tgt.deadT = 0; tgt.state = 'ko'; tgt.stT = 0; tgt.vy = -180; tgt.vx = (killer ? killer.face : 1) * 180;
    tgt.ragdoll = true; tgt.koDir = killer ? killer.face : (tgt.vx >= 0 ? 1 : -1); tgt.rig.bodyRotV += tgt.koDir * 6.5; tgt.rig.aFV += 12; tgt.rig.aBV += 10; tgt.rig.headV += tgt.koDir * 8;
    G.order.unshift(tgt);                                     // earlier deaths end up lower on the board
    if (killer && killer !== tgt) { killer.kos++; if (killer.isMe) { $('myKos').textContent = killer.kos + ' KO'; toast('K.O. ×' + killer.kos); } }
    if (Math.random() < 0.7) dropPickup(tgt.x, tgt);
    flash('#ff2ad9', 0.35); G.shake = Math.max(G.shake, 9); triggerShock(tgt.x, groundY - 116, 1.5); cineKick(1.0, killer ? killer.face : 1); spawnDust(tgt.x, 8); sfxKo();
    popImpact(tgt.x, groundY - 116, '#ff8ad8', true); pop(4, tgt.x, groundY - 116, { col: '#ffe14d', size: 1.35, grow: 1.8, life: 0.5 });   // KO burst
    const aliveN = G.fighters.filter(f => !f.dead).length;
    if (tgt.isMe) endBrawl();
    else if (aliveN <= 1) endBrawl();
  }

  // ── the readout that TEACHES ───────────────────────────────────────────────────────────────
  /* ⛔ REQUIREMENT: "the player must be able to learn that". Frame data nobody can see is a
   * spreadsheet, not a game. Every block and every hit the player is part of prints the move,
   * the number and — the load-bearing half — WHAT PUNISHES IT, straight out of `punishersFor`,
   * so the advice is derived from the same table the simulation runs on and cannot be wrong. */
  let fdT = 0;
  function showFrames(txt, adv, cls) { const el = $('fd'); if (!el) return;
    el.textContent = txt; el.className = 'fd show' + (cls ? ' ' + cls : ''); fdT = 1.5; }
  function reportBlock(att, tgt, mv) {
    const p = punishersFor(mv.id), adv = mv.onBlock;
    const who = tgt.isMe ? '' : 'THEY BLOCKED · ';
    const advice = tgt.isMe
      ? (p.length ? ' · ' + MOVES[p[0]].name + ' PUNISHES' : ' · SAFE')
      : (p.length ? ' · YOU ARE PUNISHABLE' : ' · SAFE');
    showFrames(who + mv.name + ' BLOCKED · ' + (adv > 0 ? '+' : '') + adv + advice,
      adv, tgt.isMe ? (p.length ? 'good' : 'warn') : (p.length ? 'bad' : 'good'));
  }
  function reportHit(att, tgt, mv, dmg, counter, launched, juggling) {
    const bits = [mv.name];
    if (counter) bits.push('COUNTER');
    if (juggling) bits.push('JUGGLE ×' + (tgt.juggle ? tgt.juggle.hits : 1));
    bits.push(Math.round(dmg) + '');
    bits.push(launched ? 'LAUNCH' : mv.knockdown ? 'KND' : (mv.onHit > 0 ? '+' + mv.onHit : String(mv.onHit)));
    showFrames(bits.join(' · '), mv.onHit, att.isMe ? 'good' : 'bad');
  }

  /* ── AI ────────────────────────────────────────────────────────────────────────────────────
   * ⛔ REQUIREMENT 3: "a fighter with frame data and an opponent that ignores it is a training
   *   dummy." So the rival reads the SAME table the player does, through the SAME two public
   *   questions the system already answers — `framesUntilFree(o)` and `punishersFor(id)`. It
   *   does not get a private oracle, and it does not cheat: everything below is information a
   *   human watching the screen also has.
   *
   * ⚑ THE REACTION FLOOR IS THE DESIGN. `react: 15` frames means the rival will NOT block a jab
   *   on reaction, because no human can — it only reacts to moves whose startup is ≥ 15 f. That
   *   single number is what stops a "reads the frame data" AI from becoming an unbeatable wall,
   *   and it is why the jab is the yardstick move. The probabilities below are the difficulty
   *   dial; the reaction floor is not, and should not be tuned away.
   * ⚑ NOTHING HERE KEYS ON HOLDINGS — the rival plays the same game whatever you own. */
  const AI_S = { react: 15, punish: 0.86, block: 0.62, step: 0.34, brk: 0.40, throw: 0.30, juggle: 0.88 };
  const reachPx = (f, mv) => (mv.reach * f.a.reach * (WEAP_REACH[f.weapon] || 1)) * 1.5 * BODY;
  const maxRange = (f, mv) => 40 + 1.1 * reachPx(f, mv);
  const inRecovery = o => !!o.swing && o.stT > o.swing.mv.stS + o.swing.mv.acS;
  const inStartup = o => !!o.swing && o.stT < o.swing.mv.stS;

  function stepAI(f, dt) {
    if (f.dead) return;
    let tgt = null, best = 1e9; G.fighters.forEach(o => { if (o === f || o.dead) return; const d = Math.abs(o.x - f.x); if (d < best) { best = d; tgt = o; } });
    if (!tgt) { f.aiMove = 0; return; }

    // 0 · BREAK — the only thing you may do while being thrown, and only for 20 frames
    if (f.thrown) {
      if (!f.thrown.rolled) { f.thrown.rolled = true;
        f.aiBreakAt = Math.random() < AI_S.brk ? rnd(4, THROW_BREAK - 3) : null; }
      if (f.aiBreakAt != null && f.thrown.t * FPS >= f.aiBreakAt) { tryBreak(f); f.aiBreakAt = null; }
      f.aiMove = 0; f.aiStrafe = 0; return;
    }
    if (!canAct(f)) { f.aiMove = 0; f.aiStrafe = 0; return; }
    /* A held guard is an INSTRUCTION, not a preference: without this the AI's own offence fired
     * on the next actionable frame and `_guard(true)` produced a fighter that attacked. Only the
     * debug hook sets it, so it costs the shipping AI nothing. */
    if (f.aiHold) { f.state = 'block'; f.aiMove = 0; f.aiStrafe = 0; f.face = tgt.x < f.x ? -1 : 1; return; }
    f.aiT -= dt; f.face = tgt.x < f.x ? -1 : 1;
    const lowHp = f.hp < f.maxHp * 0.3;
    const free = framesUntilFree(tgt);

    // 1 · JUGGLE — they are in the air off my launcher. Fillers, then the BOUND, then one more.
    if (tgt.juggle && (tgt.air || tgt.yLift > 4) && best < maxRange(f, MOVES.slash) && Math.random() < AI_S.juggle) {
      const n = tgt.juggle.hits;
      const route = (n >= 1 && tgt.juggle.bound) ? 'crest' : (n === 0 ? 'slash' : 'punch');
      if (startMove(f, route)) { f.aiMove = 0; f.aiT = 0.05; return; }
    }
    // 2 · PUNISH — they are in RECOVERY (blocked or whiffed) and I can reach it before they move.
    //     `free` is exactly the deficit; the punisher is the biggest move whose startup fits.
    if (inRecovery(tgt) && Math.random() < AI_S.punish) {
      let pick = null;
      for (const id of BY_STARTUP) { const m = MOVES[id];
        if (id === 'special' || id === 'grab') continue;
        if (m.st <= free && best <= maxRange(f, m)) pick = id;         // biggest that still fits
      }
      if (pick) { startMove(f, pick); f.aiMove = 0; f.aiT = 0.1;
        return; }
      if (f.meter >= 1 && MOVES.special.st <= free && best < 220) { trySpecial(f); f.aiT = 0.2; return; }
    }
    // 3a · HOLD IT. Deciding to guard and then dropping it two frames later is the same as never
    //      guarding at all — and it is exactly what happened: the rival blocked during a 24-frame
    //      startup, its `aiT` expired before the move went active, and it attacked into the hit.
    //      In a 38 s match that produced FIFTEEN sidesteps and ZERO frames of blockstun.
    if (f.guardT > 0) { f.guardT -= dt; if (canAct(f)) { f.state = 'block'; f.aiMove = 0; f.aiStrafe = 0; } return; }
    // 3 · REACT — their move is still in startup and slow enough for a human to see it coming.
    //     A LINEAR move is answered by stepping off the line; anything else by guarding.
    if (inStartup(tgt) && tgt.swing.mv.st >= AI_S.react && best < maxRange(tgt, tgt.swing.mv) + 30
        && Math.sign(f.x - tgt.x) === tgt.face) {
      const mv = tgt.swing.mv;
      if (!mv.homing && Math.random() < AI_S.step) { trySidestep(f, Math.random() < 0.5 ? 1 : -1); f.aiT = 0.25; return; }
      if (Math.random() < AI_S.block) { f.state = 'block'; f.aiStrafe = 0; f.aiMove = 0;
        f.guardT = (mv.total - mv.st) * F + 0.05;      // hold until THEIR move is spent
        f.aiT = rnd(0.18, 0.34); return; }
    }
    // 4 · A TURTLE GETS THROWN. Nothing else in the game beats a held guard, which is the point.
    if ((tgt.state === 'block' || f.blockedRun >= 2) && best < maxRange(f, MOVES.grab)
        && f.aiT <= 0 && Math.random() < AI_S.throw) { startMove(f, 'grab'); f.blockedRun = 0; f.aiT = 0.4; return; }
    // 5 · I AM MINUS. My last move was blocked at −10 or worse: pressing here is how you get
    //     launched, so guard instead. This is the AI obeying the same rule it enforces.
    if (f.minus && G.t - f.minus.t < 0.4 && f.minus.adv <= -10 && best < 160) {
      f.state = 'block'; f.aiMove = 0; f.aiT = rnd(0.12, 0.26); return;
    }

    if (f.aiT <= 0) {
      f.aiT = rnd(0.22, 0.6);
      if (f.state === 'block') f.state = 'idle';
      /* ⚑ NEUTRAL IS PART OF THE GAME. `aiT` was set BEFORE the attack, so it had almost always
       * expired again by the time the move recovered and the rival simply attacked on loop. It
       * was therefore never ACTIONABLE during the player's startup — which is the only moment
       * rule 3 can fire — so it never blocked and never sidestepped, and two of its five verbs
       * were dead. `pause` puts a real gap after the move it just committed to. */
      const pause = mv => { f.aiT = MOVES[mv].total * F + rnd(0.06, 0.34); return true; };
      if (best < maxRange(f, MOVES.slash)) {
        const r = Math.random();
        /* Offence is weighted by SAFETY, not by damage: the jab is the default because it is
         * −3, the launcher is rare because it is −20. An AI that threw its launcher on cooldown
         * would teach the player that the punish ladder does not matter. */
        if (r < 0.34) { startMove(f, 'punch'); pause('punch'); }
        else if (r < 0.58) { startMove(f, 'kick'); pause('kick'); }
        else if (r < 0.80) { startMove(f, 'slash'); pause('slash'); }
        else if (r < 0.88 && best < maxRange(f, MOVES.rising) * 0.85) { startMove(f, 'rising'); pause('rising'); }
        else if (r < 0.94) { startMove(f, 'grab'); pause('grab'); }
        else { pushSeq(f, 'punch'); startMove(f, 'punch'); pause('punch'); }   // seeds P·K / P·K·S for next time
        f.aiMove = 0; f.aiStrafe = 0;
      } else {
        f.aiStrafe = 0;
        if (f.meter >= 1 && best < 200 && Math.random() < 0.3) { trySpecial(f); return; }
        if (best < 340) { f.aiMove = f.face; if (lowHp && Math.random() < 0.4) f.aiMove = -f.face;
          if (f.shuri > 0 && best > 150 && Math.random() < 0.4) tryShuri(f);
          if (Math.random() < 0.10) trySidestep(f, Math.random() < 0.5 ? 1 : -1); }
        else f.aiMove = f.face;
      }
    }
    // grab a nearby pickup opportunistically
    G.pickups.forEach(p => { if (Math.abs(p.x - f.x) < 60 && Math.abs(p.x - f.x) > 8) f.aiMove = Math.sign(p.x - f.x); });
    if (f.state !== 'block' && canAct(f)) f.state = f.aiMove ? 'walk' : (f.air ? f.state : 'idle');
  }

  // ── update ──
  /* ⛔ EVERY CLOCK TICKS IN ITS OWN PASS, BEFORE ANY HIT IS RESOLVED — and that is not tidiness,
   * it is correctness. Fighters are stepped in array order, so with the decrement inside
   * stepFighter a defender who happens to sit LATER in the array lost one frame of blockstun on
   * the contact frame and an earlier one did not: the same move was −10 against one fighter and
   * −11 against the other, depending on turn order. Ticking first makes advantage a property of
   * the table rather than of the array, and it is why the measured numbers match to the frame. */
  function tickTimers(f, dt) {
    /* ⚠ `stT` is deliberately NOT here — it advances at the END of stepFighter, so that a move's
     * frame 1 is the frame it was input on WHETHER the input came from the AI (mid-frame) or
     * from a key / the test harness (between frames). Advancing it here made those two callers
     * disagree by one frame, which is exactly the size of the whole punish ladder. */
    if (f.invuln > 0) f.invuln -= dt; if (f.stun > 0) f.stun -= dt;
    if (f.bstun > 0) f.bstun -= dt; if (f.downT > 0) f.downT -= dt;
    if (f.bstun < EPS) f.bstun = 0; if (f.downT < EPS) f.downT = 0; if (f.stun < EPS) f.stun = 0;
    if (f.rage > 0) f.rage -= dt; if (f.glow > 0) f.glow -= dt;
    if (f.ch > 0) f.ch -= dt; if (f.stepCd > 0) f.stepCd -= dt;
    if (f.dashCd > 0) f.dashCd -= dt; if (f.wallT > 0) f.wallT -= dt;
    if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }
    if (f.grab) f.grab.t += dt;
    if (f.thrown) f.thrown.t += dt;
  }
  function stepFighter(f, dt) {
    /* ── INPUT BUFFER. A press inside blockstun or recovery is not thrown away: it fires on the
     * FIRST actionable frame, within a 4-frame window. Real fighting games all do this, and here
     * it is load-bearing rather than a courtesy — a punish is a move you must land on the first
     * frame you are free, and asking a human to hit that frame exactly with no buffer is asking
     * them not to punish. 4 frames is short enough that it cannot produce a move you did not
     * mean; a long buffer is how you get an unwanted launcher three exchanges later. */
    if (f.buf) { if (canAct(f)) { const b = f.buf; f.buf = null;
        if (b.id) startMove(f, b.id); else fireAttack(f, b.kind, b.low); }
      else { f.buf.t += dt; if (f.buf.t > 4 * F) f.buf = null; } }
    // ── FRAME-DATA STATE. Blockstun keeps the guard up whatever the block key says; the down
    //    and getup clocks are what terminate a juggle. (The clocks themselves ticked above.) ──
    if (f.bstun >= EPS) f.state = 'block';
    if (f.downT >= EPS) f.state = 'down';
    else if (f.state === 'down') { f.state = 'getup'; f.stT = 0; }
    else if (f.state === 'getup' && f.stT > GETUP_F * F) { f.state = 'idle'; f.stT = 0; }
    // ── THROW: the grab holds for THROW_HOLD frames, then it resolves or it has been broken ──
    if (f.grab) { const tg = f.grab.tgt;
      if (!tg || tg.dead || !tg.thrown) { f.grab = null; f.state = 'idle'; }
      else { tg.x = f.x + f.face * 46; tg.z = f.z; tg.vx = 0; tg.yLift = 0; tg.air = false;
        if (f.grab.t >= THROW_HOLD * F) finishThrow(f); } }
    if (f.thrown) { if (!f.thrown.by || !f.thrown.by.grab) { f.thrown = null; if (f.state === 'thrown') f.state = 'idle'; } }
    // ── SIDESTEP: 3 startup / 12 evade / 7 recovery, driving z to the stepped position ──
    if (f.step) { const total = (SSTEP.st + SSTEP.ev + SSTEP.rc - 1) * F;
      f.z = lerp(f.z, f.zGoal == null ? f.z : f.zGoal, Math.min(1, dt * 16));
      if (f.stT >= total - F * 0.5) { f.step = null; f.zGoal = null; if (f.state === 'sidestep') f.state = 'idle'; } }
    // movement intent
    let mv = 0;
    if (!f.dead && canAct(f)) {
      if (PLAYED(f)) { mv = (keys['a'] || keys['arrowleft'] ? -1 : 0) + (keys['d'] || keys['arrowright'] ? 1 : 0) + touch.mx; mv = clamp(mv, -1, 1); }
      else mv = f.aiMove || 0;
    }
    const canMove = !f.dead && canAct(f) && f.state !== 'block';
    if (canMove && Math.abs(mv) > 0.05) { f.face = mv < 0 ? -1 : 1; f.vx += mv * 4300 * f.spd * (f.rage > 0 ? 1.3 : 1) * dt; if (!f.air) f.state = 'walk';   // snappier acceleration
      f.walkPh += Math.abs(mv) * dt * 16; f.stepT = (f.stepT || 0) - dt; if (!f.air && f.stepT <= 0) { spawnDust(f.x - f.face * 6, 2); f.stepT = 0.24; } }
    else if (!f.air && f.state === 'walk') f.state = 'idle';
    // friction + integrate + wall bounce (a hard knock into the stage edge rebounds)
    /* ⚑ A JUGGLED FIGHTER IS HELD OVERHEAD. Air friction is 0.99/frame — practically none — so
     * the small push each juggle hit adds never bled off and the target drifted ~200 px downrange
     * over a 2 s juggle, i.e. clean out of JAB range by the third hit. The combo then "ended"
     * for a reason that had nothing to do with scaling, decay or the floor. 0.94 puts the total
     * drift of a launch at ~16 px. */
    f.vx *= f.juggle ? 0.94 : f.air ? 0.99 : 0.75; f.x += f.vx * dt;
    if ((f.x <= 30 || f.x >= worldW - 30) && Math.abs(f.vx) > 240 && (f.wallT || 0) <= 0) { f.vx *= -0.45; f.wallT = 0.25; G.shake = Math.max(G.shake, 6); spawnDust(f.x, 6); triggerShock(f.x, groundY - 70, 0.8); sfxHit(false); }
    f.x = clamp(f.x, 30, worldW - 30);
    const maxRun = 470 * f.spd * (f.rage > 0 ? 1.35 : 1); f.vx = clamp(f.vx, -maxRun - 520, maxRun + 520);
    // depth strafe (z) — sidestep into fore/background; recentres on the fight line, strong when not actively strafing
    let zin = 0; if (canMove) { zin = PLAYED(f) ? ((keys['e'] ? 1 : 0) - (keys['q'] ? 1 : 0) + (touch.mz || 0)) : (f.aiStrafe || 0); }
    if (!f.step) { f.zv += zin * 3000 * f.spd * dt; f.zv += (0 - f.z) * (Math.abs(zin) > 0.05 ? 1.4 : 7.5) * dt; f.zv *= 0.82; f.z += f.zv * dt; f.z = clamp(f.z, -120, 120); }
    // spin attacks — the whole body whirls (Ry in 3D, a flip-squash in 2D); the blade sweeps a full circle
    if (f.spinT > 0) { f.spinT -= dt; f.spin += 26 * dt; } else if (f.spin) { f.spin = 0; }
    /* vertical — a JUGGLED fighter falls under JUG_G (700), not the 1750 a jump uses. That single
     * constant is what makes a juggle a juggle: at jump gravity a launched opponent is back on
     * the floor in 0.49 s, which is less than one katana swing, so no follow-up could ever exist. */
    if (f.air || f.yLift > 0) { f.vy += (f.juggle ? JUG_G : 1750) * dt; f.yLift -= f.vy * dt;
      if (f.yLift <= 0) { const hard = f.vy > 260; f.yLift = 0;
        if (f.juggle && f.juggle.slam) { f.juggle.slam = false; f.vy = -BOUND_BOUNCE; f.yLift = 0.5; f.air = true; spawnDust(f.x, 8); G.shake = Math.max(G.shake, 8); }
        else { f.vy = 0; if (f.air) { f.air = false; if (hard) { spawnDust(f.x, 5); G.shake = Math.max(G.shake, 3); }
          if (f.juggle) land(f); else if (f.state === 'hurt' && f.stun <= 0) f.state = 'idle'; } } } }
    // swing lifecycle — fire the slash-arc crescent the instant the blade goes live
    if (f.swing) { const sw = f.swing; if (!sw.arced && f.stT >= sw.mv.hitS - F * 0.5) { sw.arced = true; spawnArc(f, sw.mv); }
      activeHit(f); if (f.stT >= sw.mv.endS - F * 0.5) { f.swing = null; f.move = null; if (f.state !== 'hurt' && f.state !== 'ko' && f.state !== 'grab' && !f.thrown) f.state = 'idle'; } }
    // hurt recovery
    if (f.state === 'hurt' && f.stun <= 0 && !f.air) f.state = 'idle';
    // ko slide
    if (f.dead) { f.deadT += dt; if (f.air || f.yLift > 0) { f.vy += 1500 * dt; f.yLift -= f.vy * dt; if (f.yLift <= 0) { f.yLift = 0; f.vy = 0; f.air = false; } } f.vx *= 0.9; f.x += f.vx * dt; }
    // block auto for me — but NEVER out of blockstun, which is the defender's half of the frame data
    if ((PLAYED(f) || f.aiHold) && !f.dead && f.bstun < EPS && canAct(f) && !f.air) {
      if (((PLAYED(f) && (keys['s'] || keys['arrowdown'] || touch.block)) || f.aiHold) && (f.state === 'idle' || f.state === 'walk' || f.state === 'block')) f.state = 'block';
      else if (f.state === 'block') f.state = 'idle';
    }
    stepRig(f, dt);
    f.stT += dt;                                              // ← the move clock, at the END (see tickTimers)
  }

  // ── spring-driven skeleton: each joint chases its pose target with inertia + damping,
  //    so limbs lag, overshoot and settle (weight). Hits inject velocity; KO goes limp. ──
  function springTo(r, key, target, k, d, dt) { const vk = key + 'V'; const a = (target - r[key]) * k - r[vk] * d; r[vk] += a * dt; r[key] += r[vk] * dt; }
  /* Per-archetype STANCE. All six shared one ready pose, so they read as reskins of the same
   * fighter. Each now stands its own way — offsets layered onto the idle/walk pose only, so
   * attacks and reactions stay identical and nothing about combat timing changes.
   *   crouch  hip/knee bend + how low the body rides   ·  hunch  forward pitch of the torso
   *   guard   how high and how far back the blade sits ·  wide   stance width (via bob/lean)
   *   bounce  idle liveliness                                                                */
  const STANCE = {
    ronin:    { crouch: 0,    hunch: 0,    sw: 0,     aF: 0,     lean: 0,     bounce: 1,   headT: 0 },
    kappa:    { crouch: 0.34, hunch: 0.16, sw: -0.30, aF: -0.22, lean: 0.05,  bounce: 1.5, headT: 0.06 },  // squat frog
    doomer:   { crouch: 0.16, hunch: 0.34, sw: -0.42, aF: -0.30, lean: -0.06, bounce: 0.55, headT: 0.14 }, // heavy, hunched
    oni:      { crouch: 0.22, hunch: -0.12, sw: 0.18, aF: 0.16,  lean: 0.10,  bounce: 0.75, headT: -0.08 },// wide power stance
    kunoichi: { crouch: 0.30, hunch: 0.10, sw: -0.16, aF: -0.10, lean: 0.14,  bounce: 1.35, headT: 0.04 }, // coiled, side-on
    prizm:    { crouch: -0.10, hunch: -0.08, sw: 0.26, aF: 0.20, lean: -0.04, bounce: 1.15, headT: -0.05 },// upright, floating
  };
  function poseTargets(f) {
    const t = f.stT, st = f.state;
    // sword angle sw: 0 = blade straight down · π/2 = forward · π = straight up. Ready = jodan-no-kamae:
    // both hands raised, blade held UPRIGHT above the head, ready to cut down.
    const T = { lean: 0, head: 0, aF: 2.35, eF: 0.35, aB: 2.1, eB: 0.45, hF: 0.18, kF: 0, hB: -0.18, kB: 0, sw: 2.7, bob: 0, rot: 0 };
    const spd = Math.min(1, Math.abs(f.vx) / 260);
    const SS = STANCE[f.arch] || STANCE.ronin;
    if (st === 'idle') { const b = Math.sin(G.t * 2.2 * SS.bounce), sway = Math.sin(G.t * 1.25); T.bob = -1.5 + b * 2 * SS.bounce; T.aF = 2.35 + b * 0.05; T.aB = 2.1 - b * 0.04; T.sw = 2.7 + b * 0.06; T.lean = 0.05 + sway * 0.035; T.rot = sway * 0.03; }   // grounded stance, breathing + weight-shift
    else if (st === 'walk') { const s = Math.sin(f.walkPh); T.hF = s * 0.8; T.hB = -s * 0.8; T.kF = Math.max(0, -s) * 0.85; T.kB = Math.max(0, s) * 0.85; T.aF = 2.3 - s * 0.14; T.aB = 2.05; T.sw = 2.62; T.lean = 0.18 * spd; T.rot = s * 0.05; T.bob = Math.abs(Math.cos(f.walkPh)) * 2.4; }   // hips roll with the stride
    else if (st === 'block') { T.lean = -0.14; T.aF = -1.35; T.eF = 1.35; T.aB = -1.0; T.eB = 1.1; T.sw = 1.85; T.hF = 0.35; T.hB = -0.35; T.rot = -0.05; }   // cross guard
    /* ⚑ THE POSE READS THE FRAME DATA. `P` is the live move, so a wind-up is exactly as long as
     * the move's startup and the recovery is exactly as long as its recovery — retune a number
     * in MOVES and the animation retimes with it. That is the whole reason the table is in
     * frames: an 18-frame launcher LOOKS slower than a 10-frame jab because it IS. */
    const P = (f.swing && f.swing.mv) || MOVES[st] || MOVES.punch;
    if (st === 'punch') {                                                                             // off-hand jab; sword hand stays up on guard, hips snap through
      T.aF = 2.4; T.eF = 0.3; T.sw = 2.62;
      if (t < P.stS) { const w = t / P.stS; T.aB = 2.1 - 1.6 * w; T.eB = 1.4; T.lean = -0.06 * w; T.rot = -0.05 * w; }
      else { const ex = Math.sin(clamp((t - P.stS) / (P.acS + P.rcS * 0.5), 0, 1) * Math.PI); T.aB = 0.5 - 0.9 * ex; T.eB = 1.2 - 1.1 * ex; T.lean = 0.16 * ex; T.rot = 0.12 * ex; } }
    else if (st === 'kick') {                                                                         // roundhouse / rising kick; sword held clear overhead
      const rising = f.move === 'rising';
      T.aF = 2.4; T.eF = 0.3; T.sw = 2.62;
      if (t < P.stS) { const w = t / P.stS; T.hF = (rising ? 0.5 : -0.3) * w; T.kF = (rising ? 1.5 : 1.0) * w; T.lean = (rising ? 0.22 : -0.1) * w; T.rot = -0.08 * w; }
      else { const ex = Math.sin(clamp((t - P.stS) / (P.acS + P.rcS * 0.5), 0, 1) * Math.PI);
        T.hF = (rising ? -1.5 : 1.7) * ex; T.kF = -0.35 * ex; T.lean = (rising ? -0.42 : -0.24) * ex; T.aB = 1.0; T.rot = 0.14 * ex; } }   // rising = an upward arc, not a level swing
    else if (st === 'slash') {
      if (t < P.stS) { const w = t / P.stS; T.sw = lerp(2.7, 4.05, w); T.aF = lerp(2.35, 3.0, w); T.eF = 0.28; T.aB = lerp(2.1, 2.6, w); T.lean = -0.2 * w; T.head = 0.14 * w; T.hF = 0.12 + 0.16 * w; T.rot = -0.1 * w; }   // wind-up: load back, blade cocks overhead
      else { const ph = clamp((t - P.stS) / (P.acS + P.rcS * 0.4), 0, 1); const e = ph * ph * (3 - 2 * ph);   // smoothstep → the edge accelerates through the cut
        T.sw = lerp(4.05, 0.6, e); T.aF = lerp(3.0, 0.42, e); T.eF = lerp(0.28, 0.08, e); T.aB = lerp(2.6, 0.6, e); T.lean = lerp(-0.2, 0.36, e); T.head = lerp(0.14, -0.14, e); T.hF = 0.3; T.rot = lerp(-0.1, 0.22, e); } }   // committed two-handed overhead cut, torso pitches through
    /* ── the new frame-data states. The 2D art path (js/ronin-fighters.js) falls through to its
     * neutral stance for anything it does not name, so these degrade rather than break — see
     * the interface note in docs/RONIN-COMBAT.md §9. */
    else if (st === 'throw' || st === 'grab') { const w = clamp(t / (MOVES.grab.stS + MOVES.grab.acS), 0, 1);   // both arms drive forward and clamp
      T.aF = lerp(2.35, 0.9, w); T.eF = lerp(0.35, 0.15, w); T.aB = lerp(2.1, 0.8, w); T.eB = 0.2;
      T.sw = 1.2; T.lean = 0.22 * w; T.rot = 0.1 * w; T.hF = 0.3; T.hB = -0.3; }
    else if (st === 'thrown') { T.lean = -0.5; T.head = -0.45; T.aF = 1.0; T.aB = 1.2; T.eF = 0.9; T.eB = 0.9;
      T.sw = 0.9; T.hF = -0.35; T.kF = 0.7; T.rot = -0.28 + Math.sin(t * 40) * 0.1; }                  // held up, kicking to break
    else if (st === 'down') { T.lean = -0.2; T.head = 0.3; T.aF = 1.6; T.aB = 1.5; T.eF = 0.4; T.eB = 0.4;
      T.sw = 1.1; T.hF = 0.9; T.kF = 1.1; T.hB = 0.6; T.kB = 0.9; T.bob = -34; T.rot = f.koDir * 1.35; }   // flat on the deck
    else if (st === 'getup') { const w = clamp(t / (GETUP_F * F), 0, 1);
      T.lean = lerp(-0.2, 0.02, w); T.aF = lerp(1.6, 2.35, w); T.aB = lerp(1.5, 2.1, w); T.sw = lerp(1.1, 2.7, w);
      T.hF = lerp(0.9, 0.18, w); T.kF = lerp(1.1, 0, w); T.hB = lerp(0.6, -0.18, w); T.kB = lerp(0.9, 0, w);
      T.bob = lerp(-34, 0, w); T.rot = f.koDir * 1.35 * (1 - w); }
    else if (st === 'sidestep') { const d = f.step ? f.step.dir : 1, w = Math.sin(clamp(t / ((SSTEP.st + SSTEP.ev + SSTEP.rc) * F), 0, 1) * Math.PI);
      T.lean = 0.10 * w; T.rot = -d * 0.34 * w; T.head = -d * 0.16 * w; T.bob = -3 * w;                // shoulders turn off the line
      T.hF = 0.18 + 0.5 * w; T.kF = 0.55 * w; T.hB = -0.18 - 0.3 * w; T.kB = 0.35 * w; T.sw = 2.5; }
    else if (st === 'special') { T.sw = 1.5; T.aF = 1.45; T.eF = 0.12; T.aB = 1.4; T.lean = 0.1; T.rot = 0; T.hF = 0.2; T.hB = -0.2; }   // blade extended level — the BODY whirls (f.spin) so the edge sweeps a full circle
    else if (st === 'air') {                                                            // leaping / boosting
      const rise = f.w && f.w.vy > 0; T.sw = 2.6; T.aF = rise ? 2.9 : 2.2; T.aB = rise ? 2.7 : 1.6; T.eF = 0.3; T.eB = 0.4;
      T.hF = rise ? -0.45 : 0.5; T.kF = rise ? 1.15 : 0.35; T.hB = rise ? 0.3 : -0.35; T.kB = rise ? 0.5 : 0.15;
      T.lean = rise ? -0.16 : 0.2; T.bob = 0; }
    if (st === 'idle' || st === 'walk' || st === 'block') {                 // layer the archetype's stance
      T.hF += SS.crouch * 0.55; T.hB -= SS.crouch * 0.35; T.kF += SS.crouch * 0.7; T.kB += SS.crouch * 0.55;
      T.bob -= SS.crouch * 5;                                              // ride lower on a deeper crouch
      T.lean += SS.hunch * 0.5 + SS.lean; T.head += SS.headT;
      T.sw += SS.sw; T.aF += SS.aF; T.aB += SS.aF * 0.6;
    }
    if (false) {}
    else if (st === 'hurt') { T.lean = -0.34; T.aF = 1.4; T.aB = 1.7; T.eF = 0.2; T.sw = 1.1; T.head = -0.3; T.hF = -0.2; T.rot = -0.12; }
    return T;
  }
  function stepRig(f, dt) {
    const r = f.rig; if (!r) return;
    if (f.ragdoll) {                                          // limp: limbs hang, body tumbles under its spin + gravity
      const K = 34, D = 8;
      springTo(r, 'aF', 1.5, K, D, dt); springTo(r, 'aB', 1.4, K, D, dt); springTo(r, 'eF', 0.25, K, D, dt); springTo(r, 'eB', 0.3, K, D, dt);
      springTo(r, 'hF', 0.3, K, D, dt); springTo(r, 'hB', -0.15, K, D, dt); springTo(r, 'kF', 0.5, K, D, dt); springTo(r, 'kB', 0.45, K, D, dt);
      springTo(r, 'sw', 1.3, 26, 7, dt); springTo(r, 'head', 0.5 * f.koDir, K, D, dt); springTo(r, 'bob', 0, 30, 8, dt);
      const rest = f.koDir * 1.5;                             // fall flat in the knock direction
      r.bodyRotV += (rest - r.bodyRot) * 26 * dt - r.bodyRotV * 7 * dt; r.bodyRot += r.bodyRotV * dt;
      return;
    }
    const T = poseTargets(f);
    const atk = f.state === 'punch' || f.state === 'kick' || f.state === 'slash' || f.state === 'special';
    const K = atk ? 460 : 300, D = atk ? 34 : 32;             // crisper: limbs snap to pose then settle (less robotic lag/wobble)
    springTo(r, 'lean', T.lean, atk ? 300 : 150, 20, dt); springTo(r, 'head', T.head, 150, 17, dt);
    springTo(r, 'aF', T.aF, K, D, dt); springTo(r, 'eF', T.eF, K, D, dt);
    springTo(r, 'aB', T.aB, K * 0.82, D, dt); springTo(r, 'eB', T.eB, K * 0.82, D, dt);
    springTo(r, 'hF', T.hF, K, D, dt); springTo(r, 'kF', T.kF, K, D, dt);
    springTo(r, 'hB', T.hB, K, D, dt); springTo(r, 'kB', T.kB, K, D, dt);
    springTo(r, 'sw', T.sw, (f.state === 'slash' || f.state === 'special') ? 720 : 220, 32, dt);   // the blade cracks through the arc
    springTo(r, 'bob', T.bob, 190, 20, dt);
    // torso rotates INTO the strike (hip/shoulder drive) then rights itself; impacts still rock it
    r.bodyRotV += (T.rot - r.bodyRot) * (atk ? 240 : 150) * dt - r.bodyRotV * 18 * dt; r.bodyRot += r.bodyRotV * dt;
  }
  function impulse(f, worldDir, mag, knockdown) {             // inject momentum on a hit
    const r = f.rig; if (!r) return;
    r.bodyRotV += worldDir * mag * (knockdown ? 1.1 : 0.5);
    r.aFV += 9 * mag; r.aBV += 7 * mag; r.headV += worldDir * 5 * mag; r.leanV -= 6 * mag;
  }

  function stepPickups(dt) {
    for (let i = G.pickups.length - 1; i >= 0; i--) { const p = G.pickups[i]; p.t += dt; p.bob += dt * 3;
      if (p.y < 0 || p.vy !== 0) { p.vy += 1400 * dt; p.y += p.vy * dt; if (p.y >= 0) { p.y = 0; p.vy = 0; } }
      // collect
      for (const f of G.fighters) { if (f.dead) continue; if (Math.abs(f.x - p.x) < 30 && f.yLift < 40) { applyPickup(f, p.type); G.pickups.splice(i, 1); break; } }
    }
  }
  function applyPickup(f, type) {
    if (type === 'heal') { f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.32); if (f.isMe) toast('+HEALTH'); }
    else if (type === 'shuri') { f.shuri += 3; if (f.isMe) { toast('+3 SHURIKEN'); updShuri(); } }
    else if (type === 'glow') { f.glow = 8; if (f.isMe) toast('KATANA GLOW'); }
    else if (type === 'rage') { f.rage = 8; if (f.isMe) toast('RAGE'); }
    for (let i = 0; i < 10; i++) spark(f.x, groundY - 40, PTYPES[type].c); sfxPick();
  }

  function stepShuriken(dt) {
    for (let i = G.fx.length - 1; i >= 0; i--) { const e = G.fx[i]; if (e.kind !== 'shuri') continue;
      e.x += e.vx * dt; e.spin += dt * 22; e.y = e.y; let hit = false;
      G.fighters.forEach(t => { if (t.dead || t.id === e.side || hit) return; if (Math.abs(t.x - e.x) < 24 && t.yLift < 60) {
        hit = true; if (t.state === 'block' && Math.sign(e.vx) === -t.face) { t.hp -= e.dmg * 0.2; spark(t.x, groundY - 116, '#8ffff0'); }
        else { t.hp -= e.dmg; t.stun = 0.2; t.state = 'hurt'; t.stT = 0; t.vx += Math.sign(e.vx) * 120; impulse(t, Math.sign(e.vx), 0.5, false); spark(t.x, groundY - 116, '#8ffff0');
          const att = G.fighters.find(f => f.id === e.side); if (t.hp <= 0) ko(t, att); } } });
      if (hit || e.x < G.cam.x - 60 || e.x > G.cam.x + W + 60) G.fx.splice(i, 1);
    }
  }

  // ── anime sprite pops: billboarded manga glyphs (impact star, speed lines, "!", sweat, burst ring) ──
  // kinds: 0 star · 1 speed-line · 2 bang · 3 sweat · 4 burst-ring
  function pop(kind, x, y, o) { if (!G) return; o = o || {};
    G.pops.push({ kind, x, y, z: o.z || 0, col: o.col || '#ffffff', size: o.size || 0.5, rot: o.rot || 0, grow: o.grow == null ? 0.35 : o.grow, a: o.a == null ? 1 : o.a, t: 0, life: o.life || 0.34 }); }
  function popImpact(x, y, col, big) {                        // star-burst + radiating speed lines on a hit
    pop(0, x, y, { col: col || '#fff2a8', size: big ? 0.95 : 0.6, rot: rnd(0, 6.28), life: big ? 0.4 : 0.28 });
    const n = big ? 5 : 3; for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), d = rnd(20, 46);
      pop(1, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, { col: col || '#ffffff', size: big ? 0.5 : 0.34, rot: a + 1.57, grow: 0.7, life: 0.22, a: 0.9 }); }
    if (big) pop(4, x, y, { col: col || '#ff8ad8', size: 1.0, grow: 1.5, life: 0.36, a: 0.85 });
  }
  function spark(x, y, col) { G.fx.push({ kind: 'spark', x, y, vx: rnd(-140, 140), vy: rnd(-200, 40), col, t: 0, life: rnd(0.25, 0.5), r: rnd(1.5, 3.5) }); }
  function flash(col, a) { G.fx.push({ kind: 'flash', col, a, t: 0, life: 0.35 }); }
  // dust puffs kicked up at the feet — landings, footsteps, wall bounces
  function spawnDust(x, n) { for (let i = 0; i < n; i++) G.fx.push({ kind: 'dust', x: x + rnd(-8, 8), y: groundY - rnd(0, 6), vx: rnd(-70, 70), vy: rnd(-70, -10), t: 0, life: rnd(0.35, 0.65), r: rnd(3, 7) }); }
  // a screen-space shockwave ripple through the GL compositor at a world impact point
  function triggerShock(worldX, screenY, str) { if (!G) return; G.shock = { ux: clamp((worldX - G.cam.x) / Math.max(1, W), 0, 1), uy: 1 - clamp(screenY / Math.max(1, H), 0, 1), wx: worldX, wy: screenY, t: 0, spd: 2.4, str: str || 1 }; }
  // cinematic camera punch — the 3D renderer eases toward a pulled-in, swung-round shot on hero moments
  function cineKick(amt, dir) { if (!G) return; if (amt >= (G.camZoom || 0)) { G.camZoom = amt; G.camDir = dir < 0 ? -1 : 1; } }
  // anime slash-arc: a bright crescent swept in front of the fighter the moment the strike goes active
  function spawnArc(f, atk) {
    const reach = (atk.reach * f.a.reach * (WEAP_REACH[f.weapon] || 1)) * 1.5 * BODY;
    let a0, a1, rr, big = atk.kind === 'slash';
    if (atk.kind === 'slash') { a0 = -2.35; a1 = 0.9; rr = reach * 1.1; }
    else if (atk.kind === 'kick') { a0 = 0.15; a1 = 1.55; rr = reach * 0.98; }
    else { a0 = -0.6; a1 = 0.6; rr = reach * 0.72; }
    G.fx.push({ kind: 'arc', x: f.x + f.face * 18, y: groundY - 116 - f.yLift, face: f.face, r: rr, a0, a1, col: f.glow > 0 ? '#ffe6a0' : (f.tint || '#eaf6ff'), t: 0, life: big ? 0.24 : 0.16 });
  }

  function update(dt) {
    G.t += dt; window.__rnT = G.t; G.groundY = groundY; G.BODY = BODY;
    if (G.__lab) G.hitstop = 0;                                // the combat lab measures frames, not feel
    if (G.hitstop > 0) { G.hitstop -= dt; dt = Math.min(dt, 0.006); }
    if (G.started && G.mode === 'play') { G.timeLeft -= dt; if (G.timeLeft <= 0) { G.timeLeft = 0; endBrawl(); } }
    // ── WORLD MODE: free-roam the city. Run / sprint / leap / boost-fly, camera-relative. ──
    if (G.worldMode && window.RoninWorld && RoninWorld.world) {
      const yaw = G.camYaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
      for (const f of G.fighters) { if (!f.w) continue;
        let ix = 0, iz = 0, sprint = false, jump = false;
        if (f.isMe && !f.dead) {
          const kx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
          const kz = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
          ix = kx * cs - kz * sn; iz = kx * sn + kz * cs;        // camera-relative
          ix += touch.mx || 0; iz += touch.mz || 0;
          sprint = !!keys['shift']; jump = !!keys[' '];
        } else if (!f.dead) {                                     // rivals chase the player through the city
          const me = G.me; if (me && me.w) { const dx = me.w.x - f.w.x, dz = me.w.z - f.w.z, d = Math.hypot(dx, dz);
            if (d > 3) { ix = dx / d; iz = dz / d; sprint = d > 18; } jump = d > 26 && f.w.onGround; }
        }
        RoninWorld.step(f.w, dt, { mx: ix, mz: iz, sprint, jump });
        if (ix || iz) f.faceYaw = Math.atan2(ix, iz);             // turn to face travel
        f.x = f.w.x * 52; f.z = f.w.z * 52; f.yLift = f.w.y * 52;  // feed the existing render/combat space
        // ── drive the SKELETON, or they just slide around frozen ──
        const spd = f.w.speed || 0;
        f.stT += dt;
        if (!f.w.onGround) { f.state = 'air'; f.air = true; }
        else { f.air = false; f.state = spd > 0.6 ? 'walk' : 'idle'; }
        f.walkPh += spd * dt * 0.85;                              // stride cadence tracks real speed
        if (!f.w.onGround && f.w.flying) f.boostFx = (f.boostFx || 0) - dt;
        if (f.w.onGround && spd > 6) { f.stepT = (f.stepT || 0) - dt;
          if (f.stepT <= 0) { spawnDust(f.x - Math.sin(f.faceYaw || 0) * 8, 2); f.stepT = spd > 18 ? 0.16 : 0.26; } }
        stepRig(f, dt);
      }
      const me = G.me;
      if (me && me.w) { const tgt = (me.faceYaw != null ? me.faceYaw : 0);
        G.camYaw = (G.camYaw || 0) + (0) * dt;                    // yaw is player-driven (Q/E) not auto
        if (keys['q']) G.camYaw = (G.camYaw || 0) - 1.8 * dt;
        if (keys['e']) G.camYaw = (G.camYaw || 0) + 1.8 * dt; }
      updateHUD(); return;                                        // world mode skips the duel sim
    }
    G.fighters.forEach(f => tickTimers(f, dt));               // ← every clock, before any decision
    if (G.started) G.fighters.forEach(f => { if (!PLAYED(f) && !f.noAI) stepAI(f, dt); });
    G.fighters.forEach(f => stepFighter(f, dt));
    // soft body separation — keep the two big duellists from fully overlapping at melee range
    { const a = G.fighters[0], b = G.fighters[1]; if (a && b && !a.dead && !b.dead && a.yLift < 30 && b.yLift < 30 && Math.abs((a.z || 0) - (b.z || 0)) < 60) {
      const dx = b.x - a.x, d = Math.abs(dx), minD = 66; if (d < minD) { const s = (dx < 0 ? -1 : 1), push = (minD - d) / 2 * s;
        a.x = clamp(a.x - push, 30, worldW - 30); b.x = clamp(b.x + push, 30, worldW - 30); } } }
    stepPickups(dt); stepShuriken(dt);
    // fx
    for (let i = G.fx.length - 1; i >= 0; i--) { const e = G.fx[i]; if (e.kind === 'shuri') continue; e.t += dt;
      if (e.kind === 'spark') { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 500 * dt; }
      else if (e.kind === 'dust') { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 120 * dt; e.vx *= 0.94; }
      if (e.t >= e.life) G.fx.splice(i, 1); }
    // sprite pops (drift up slightly as they fade)
    for (let i = G.pops.length - 1; i >= 0; i--) { const p = G.pops[i]; p.t += dt; p.y -= 26 * dt; if (p.t >= p.life) G.pops.splice(i, 1); }
    // camera: frame BOTH duellists (centre on their midpoint), clamped to the stage
    const midX = (G.me.x + G.foe.x) / 2;
    G.cam.x = lerp(G.cam.x, clamp(midX - W / 2, 0, Math.max(0, worldW - W)), Math.min(1, dt * 6));
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
    if (G.camZoom > 0) G.camZoom = Math.max(0, G.camZoom - dt * 2.4);
    if (G.shock) { G.shock.t += dt; if (G.shock.t > 0.5) G.shock = null; }
    updateHUD();
  }

  // ═════════ RENDER ═════════
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const sx = G.shake > 0 ? rnd(-1, 1) * G.shake : 0, sy = G.shake > 0 ? rnd(-1, 1) * G.shake * 0.5 : 0;
    ctx.save(); ctx.translate(sx, sy);
    drawBg(); drawGround();
    // depth-sort by x-position feet (further left drawn first is fine); draw pickups then fighters then fx
    G.pickups.forEach(drawPickup);
    G.fighters.slice().sort((a, b) => (a.dead ? -1 : 0) - (b.dead ? -1 : 0)).forEach(drawFighter);
    G.fx.forEach(drawFx);
    ctx.restore();
    drawFlash();
  }
  function drawBg() {
    const cx = G.cam.x;
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, groundY); g.addColorStop(0, '#160a2e'); g.addColorStop(0.6, '#2a0d4a'); g.addColorStop(1, '#3a1152');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, groundY);
    // moon
    const mx = W * 0.78 - cx * 0.04, my = H * 0.2; ctx.save(); ctx.shadowColor = '#ffd9a8'; ctx.shadowBlur = 40;
    ctx.fillStyle = '#ffe9c2'; ctx.beginPath(); ctx.arc(mx, my, 46, 0, 6.28); ctx.fill(); ctx.restore();
    // far skyline (parallax .18)
    drawSkyline(cx * 0.18, groundY * 0.72, groundY, 120, '#1a0e38', 90, 3);
    // near skyline (parallax .42)
    drawSkyline(cx * 0.42, groundY * 0.5, groundY, 200, '#241148', 140, 7);
  }
  function drawSkyline(off, top, base, seed, col, h, win) {
    ctx.fillStyle = col; let x = -((off % 260) + 260);
    for (; x < W + 60; x += 0) { const w = 60 + ((Math.sin(x * 0.7 + seed) * 0.5 + 0.5) * 70 | 0); const bh = h + (Math.sin(x * 1.3 + seed) * 0.5 + 0.5) * 90;
      const y = base - bh; ctx.fillStyle = col; ctx.fillRect(x, y, w, bh);
      // neon windows
      ctx.fillStyle = 'rgba(61,240,255,.5)'; for (let wy = y + 14; wy < base - 12; wy += 20) for (let wx = x + 8; wx < x + w - 8; wx += 16) if ((wx + wy + seed) % 3 === 0) ctx.fillRect(wx, wy, 5, 7);
      x += w + 14; }
  }
  function drawGround() {
    ctx.fillStyle = '#0c0620'; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(255,42,217,.7)'; ctx.lineWidth = 2; ctx.shadowColor = '#ff2ad9'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke(); ctx.shadowBlur = 0;
    // scrolling floor tiles
    ctx.strokeStyle = 'rgba(180,123,255,.18)'; ctx.lineWidth = 1; const cx = G.cam.x;
    for (let i = -1; i < 40; i++) { const x = i * 90 - (cx % 90); ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x - 40, H); ctx.stroke(); }
  }
  function drawPickup(p) {
    const x = p.x - G.cam.x, y = groundY - 26 - p.y - Math.sin(p.bob) * 5; const t = PTYPES[p.type];
    ctx.save(); ctx.shadowColor = t.c; ctx.shadowBlur = 16; ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.28); ctx.fill(); ctx.strokeStyle = t.c; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = t.c; ctx.font = '14px "Arial Black",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.g, x, y + 1); ctx.restore();
  }

  // big detailed fighter — the spring rig drives the skeleton (RoninArt.skel), each
  // archetype draws its own body/gear/weapon (RoninArt.draw), body rotates by bodyRot.
  function drawFighter(f) {
    const zo = f.z || 0, x = f.x - G.cam.x, gy = groundY - f.yLift - zo * 0.34, fc = f.face, r = f.rig, rot = r.bodyRot, zs = 1 - zo * 0.0009;   // fake depth for the 2D fallback
    drawTrail(f);
    const K = RoninArt.skel(f);
    ctx.save(); ctx.translate(x, gy); ctx.rotate(rot); ctx.scale(fc * BODY * zs * (f.spin ? Math.cos(f.spin) : 1), BODY * zs);
    const alpha = f.dead ? Math.max(0.2, 1 - Math.max(0, f.deadT - 1.4) * 0.5) : 1;
    const flick = f.invuln > 0 && !f.dead && Math.floor(G.t * 20) % 2 ? 0.45 : 1;
    ctx.globalAlpha = alpha * flick;
    if (!f.dead && (f.rage > 0 || f.glow > 0 || f.meter >= 1)) { ctx.save(); ctx.shadowColor = f.rage > 0 ? '#ff6b57' : (f.glow > 0 ? '#ffd23b' : f.tint); ctx.shadowBlur = 26;
      ctx.fillStyle = 'rgba(0,0,0,0.001)'; ctx.beginPath(); ctx.arc(0, -86, 54, 0, 6.28); ctx.fill(); ctx.restore(); }
    try { RoninArt.draw(ctx, f, K); } catch (e) {}
    ctx.restore();
    // record the blade tip in WORLD space for the streak (x world, y screen), scaled by BODY
    if (!f.dead) { const tip = K.sword.tip, c = Math.cos(rot), s = Math.sin(rot), px = tip.x * fc * BODY, py = tip.y * BODY;
      f.trail.unshift({ x: f.x + (px * c - py * s), y: gy + (px * s + py * c) }); if (f.trail.length > 9) f.trail.pop(); }
    else if (f.trail.length) f.trail.pop();
  }
  // blade streak — additive, alpha scaled by tip speed so only fast swings smear (idle stays clean)
  function drawTrail(f) {
    const tr = f.trail; if (tr.length < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < tr.length - 1; i++) { const a = tr[i], b = tr[i + 1]; const spd = Math.hypot(a.x - b.x, a.y - b.y);
      const al = (1 - i / tr.length) * clamp(spd / 22, 0, 1); if (al < 0.03) continue;
      ctx.strokeStyle = (f.glow > 0 ? 'rgba(255,240,180,' : 'rgba(206,240,255,') + al.toFixed(3) + ')';
      ctx.lineWidth = (1 - i / tr.length) * 9 + 1; ctx.shadowColor = f.glow > 0 ? '#ffd23b' : f.tint; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(a.x - G.cam.x, a.y); ctx.lineTo(b.x - G.cam.x, b.y); ctx.stroke(); }
    ctx.restore();
  }
  function footPt(hip, knee, hipY) { const thigh = 24, shin = 22; const kx = Math.sin(hip) * thigh, ky = hipY + Math.cos(hip) * thigh;
    const fx2 = kx + Math.sin(hip + knee) * shin, fy = ky + Math.cos(hip + knee) * shin; return { kx, ky, fx: fx2, fy }; }
  function limb(x0, y0, pt, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(pt.kx, pt.ky); ctx.lineTo(pt.fx, pt.fy); ctx.stroke(); }
  function drawArm(sx, sy, sh, el, w, col, weapon) {
    const up = 22, fore = 20; const ex = sx + Math.sin(sh) * up, ey = sy + Math.cos(sh) * up;
    const hx = ex + Math.sin(sh + el) * fore, hy = ey + Math.cos(sh + el) * fore;
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    if (weapon) { const a = weapon.ang; const bx = hx + Math.sin(a) * weapon.len, by = hy + Math.cos(a) * weapon.len;
      ctx.save(); ctx.strokeStyle = weapon.glow ? '#fff6c2' : '#eaf6ff'; ctx.lineWidth = weapon.spin ? 5 : 3.5; ctx.lineCap = 'round';
      ctx.shadowColor = weapon.glow ? '#ffd23b' : weapon.tint; ctx.shadowBlur = weapon.spin ? 26 : 12;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
      // guard
      ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - Math.cos(a) * 5, hy + Math.sin(a) * 5); ctx.lineTo(hx + Math.cos(a) * 5, hy - Math.sin(a) * 5); ctx.stroke(); ctx.restore();
      return { bx, by }; }
    return null;
  }
  function drawHead(x, y, f, tilt) {
    ctx.save(); ctx.translate(x, y); if (tilt) ctx.rotate(clamp(tilt, -0.6, 0.6));
    ctx.fillStyle = f.col; ctx.shadowColor = f.tint; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.28); ctx.fill(); ctx.shadowBlur = 0;
    // headband + ribbons
    ctx.fillStyle = f.tint; ctx.fillRect(-11, -4, 22, 5);
    ctx.strokeStyle = f.tint; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(-22, 2 + Math.sin(G.t * 6) * 3, -26, 8); ctx.stroke();
    // face
    const fk = f.a.face;
    ctx.fillStyle = '#0a0512';
    if (fk === 'pepe') { ctx.fillStyle = '#fff'; blob(4, -1, 4); blob(-4, -1, 4); ctx.fillStyle = '#0a0512'; blob(5, -1, 1.6); blob(-3, -1, 1.6); ctx.strokeStyle = '#0a0512'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5, 5); ctx.quadraticCurveTo(0, 8, 5, 5); ctx.stroke(); }
    else if (fk === 'wojak') { ctx.strokeStyle = '#0a0512'; ctx.lineWidth = 1.3; dot(3, 0); dot(-3, 0); ctx.beginPath(); ctx.moveTo(-4, 6); ctx.quadraticCurveTo(0, 3, 4, 6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-2, -3); ctx.moveTo(6, -4); ctx.lineTo(2, -3); ctx.stroke(); }
    else if (fk === 'oni') { ctx.fillStyle = '#ffe14d'; tri(4, 0, 1); tri(-4, 0, -1); ctx.fillStyle = '#fff'; ctx.fillRect(-4, 5, 8, 2); ctx.fillStyle = '#7a1010'; ctx.fillRect(-11, -12, 4, 6); ctx.fillRect(7, -12, 4, 6); }
    else if (fk === 'kuno') { ctx.fillStyle = '#120a1e'; ctx.fillRect(-11, 1, 22, 8); ctx.fillStyle = f.tint; blob(4, -1, 2.4); blob(-4, -1, 2.4); }
    else if (fk === 'prizm') { const g = ctx.createLinearGradient(-8, -8, 8, 8); g.addColorStop(0, '#ff2ad9'); g.addColorStop(.5, '#3df0ff'); g.addColorStop(1, '#ffd23b'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 6.28); ctx.fill(); ctx.fillStyle = '#0a0512'; dotf(4, -1, 1.6); dotf(-4, -1, 1.6); }
    else { ctx.fillStyle = '#120a1e'; ctx.fillRect(-11, 0, 22, 7); ctx.fillStyle = f.tint; ctx.fillRect(-6, 1.5, 12, 2); }   // ronin mask + eye slit
    ctx.restore();
    function blob(bx, by, r) { ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.28); ctx.fill(); }
    function dotf(bx, by, r) { ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.28); ctx.fill(); }
    function dot(bx, by) { ctx.beginPath(); ctx.arc(bx, by, 1.4, 0, 6.28); ctx.fillStyle = '#0a0512'; ctx.fill(); }
    function tri(bx, by, d) { ctx.beginPath(); ctx.moveTo(bx - 3 * d, by + 2); ctx.lineTo(bx + 3 * d, by - 2); ctx.lineTo(bx, by + 3); ctx.fill(); }
  }
  function drawFx(e) {
    if (e.kind === 'spark') { const x = e.x - G.cam.x, y = e.y; ctx.save(); ctx.globalAlpha = 1 - e.t / e.life; ctx.fillStyle = e.col; ctx.shadowColor = e.col; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, e.r * (1 - e.t / e.life * 0.5), 0, 6.28); ctx.fill(); ctx.restore(); }
    else if (e.kind === 'dust') { const p = e.t / e.life; ctx.save(); ctx.globalAlpha = (1 - p) * 0.5; ctx.fillStyle = '#b9a6d8';
      ctx.beginPath(); ctx.arc(e.x - G.cam.x, e.y, e.r * (1 + p * 1.6), 0, 6.28); ctx.fill(); ctx.restore(); }
    else if (e.kind === 'shuri') { const x = e.x - G.cam.x, y = groundY - 116 + e.y; ctx.save(); ctx.translate(x, y); ctx.rotate(e.spin); ctx.strokeStyle = '#d8fff0'; ctx.fillStyle = '#8ffff0'; ctx.shadowColor = '#2bffb0'; ctx.shadowBlur = 10;
      for (let i = 0; i < 4; i++) { ctx.rotate(1.57); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3, -3); ctx.lineTo(0, -11); ctx.lineTo(-3, -3); ctx.closePath(); ctx.fill(); } ctx.restore(); }
    else if (e.kind === 'arc') { const p = clamp(e.t / e.life, 0, 1); ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(e.x - G.cam.x, e.y); ctx.scale(e.face, 1);
      const rO = e.r * (0.86 + p * 0.3), rI = e.r * 0.40;
      const g = ctx.createRadialGradient(0, 0, rI, 0, 0, rO); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(232,246,255,' + ((1 - p) * 0.85).toFixed(3) + ')'); g.addColorStop(0.92, 'rgba(255,255,255,' + ((1 - p) * 0.55).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rO, e.a0, e.a1, false); ctx.arc(0, 0, rI, e.a1, e.a0, true); ctx.closePath(); ctx.fill();
      // bright leading edge that fades along the sweep + a coloured glow
      ctx.globalAlpha = (1 - p); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6 * (1 - p) + 1; ctx.shadowColor = e.col; ctx.shadowBlur = 26; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, rO * 0.9, e.a0, e.a1, false); ctx.stroke();
      ctx.globalAlpha = (1 - p) * 0.7; ctx.strokeStyle = e.col; ctx.lineWidth = 12 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, rO * 0.9, e.a0, e.a1, false); ctx.stroke(); ctx.restore(); }
  }
  function drawFlash() { const f = G.fx.find(e => e.kind === 'flash'); if (!f) return; ctx.save(); ctx.globalAlpha = f.a * (1 - f.t / f.life); ctx.fillStyle = f.col; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  function shade(hex, d) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) + d, g = ((n >> 8) & 255) + d, b = (n & 255) + d;
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }

  // ── HUD ──
  let comboTimer = 0;
  function bumpCombo(n) { if (n < 2) return; $('comboN').textContent = n; const c = $('combo'); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); comboTimer = 1.1; }
  function updMeter() { const m = G.me.meter; $('meterFill').style.width = (m * 100) + '%'; $('meterWrap').classList.toggle('rdy', m >= 1); $('padX').classList.toggle('rdy', m >= 1 && window.GameHelp && GameHelp.isTouch); }
  function updShuri() { const s = G.me.shuri; const p = $('padShuri'); if (window.GameHelp && GameHelp.isTouch) p.style.display = s > 0 ? 'grid' : 'none'; }
  function updateHUD() {
    const me = G.me, foe = G.foe; $('hpFill').style.width = clamp(me.hp / me.maxHp * 100, 0, 100) + '%';
    updMeter();
    if (foe) { $('foeHp').style.width = clamp(foe.hp / foe.maxHp * 100, 0, 100) + '%'; if (foe.kos) $('foeKos').textContent = foe.kos + ' KO'; }
    const s = Math.max(0, G.timeLeft | 0); $('clock').textContent = (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0');
    if (comboTimer > 0) { comboTimer -= 1 / 60; if (comboTimer <= 0) $('combo').classList.remove('show'); }
    let hint = []; if (me.shuri > 0) hint.push('SHURI ×' + me.shuri); if (me.glow > 0) hint.push('KATANA GLOW'); if (me.rage > 0) hint.push('RAGE');
    $('pickHint').innerHTML = hint.map(h => '<b>' + h + '</b>').join(' · ');
    if (fdT > 0) { fdT -= 1 / 60; if (fdT <= 0) { const el = $('fd'); if (el) el.className = 'fd'; } }
    drawMinimap();
  }
  const miniCv = () => $('mini');
  function drawMinimap() {
    const mc = miniCv(); if (!mc) return; const g = mc.getContext('2d'); const mw = mc.width, mh = mc.height; g.clearRect(0, 0, mw, mh);
    const sx = x => (x / worldW) * (mw - 8) + 4;
    // stage floor line + camera viewport window
    g.strokeStyle = 'rgba(180,123,255,.3)'; g.beginPath(); g.moveTo(4, mh - 7); g.lineTo(mw - 4, mh - 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(sx(G.cam.x), 2, (W / worldW) * (mw - 8), mh - 4);
    // pickups
    G.pickups.forEach(p => { const t = PTYPES[p.type]; g.fillStyle = t.c; g.beginPath(); g.arc(sx(p.x), mh - 12, 1.8, 0, 6.28); g.fill(); });
    // fighters (you = lime, rival = coral), dead = hollow
    G.fighters.forEach(f => { const x = sx(f.x); g.fillStyle = f.isMe ? '#2bff80' : '#ff5a3c';
      g.globalAlpha = f.dead ? 0.35 : 1; g.beginPath(); g.arc(x, mh - 12, f.isMe ? 4 : 3.4, 0, 6.28); g.fill();
      g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x - 0.5, mh - 18, 1, 4); });
  }

  // ── loop ──
  let glOk = false, r3dOk = false;
  function loop(now) { let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G && G.mode !== 'lobby') { update(dt);
      if (r3dOk) { if (!Ronin3D.render(G)) { r3dOk = false; $('cv3d').style.display = 'none'; $('cv').style.display = 'block'; } }
      else { draw();
        if (glOk) { const shk = G.shock ? { x: G.shock.ux, y: G.shock.uy, z: G.shock.t * G.shock.spd } : null;
          if (!RoninGL.present(cv, shk)) { glOk = false; const g = $('glcv'); if (g) g.style.display = 'none'; } } } }
    if (running) requestAnimationFrame(loop); }

  // ── end / podium ──
  function endBrawl() {
    if (G.mode === 'over') return; G.mode = 'over'; G.started = false;
    if (window.RipNet) { try { RipNet.setStatus('idle'); } catch {} }
    // build final order: survivors first (by hp/kos), then the dead in reverse-death order (already unshifted)
    const alive = G.fighters.filter(f => !f.dead).sort((a, b) => (b.kos - a.kos) || (b.hp - a.hp));
    const dead = G.order.filter(f => f.dead);
    const finalOrder = alive.concat(dead.filter(d => !alive.includes(d)));
    // ensure all fighters present
    G.fighters.forEach(f => { if (!finalOrder.includes(f)) finalOrder.push(f); });
    const myRank = Math.max(1, finalOrder.indexOf(G.me) + 1);
    const won = myRank === 1;                                  // heads-up: last blade standing takes the pot
    const P = WagerPayout.compute(wager.ante, wager.players, wager.cards, myRank);
    let wonSlugs = [];
    if (G.real && won && P.myCards > 0) { const v = vault();
      const pool = G.myStake.concat([].concat(...G.oppStakes)).filter(sl => bySlug.has(sl));
      for (let i = 0; i < P.myCards && pool.length; i++) wonSlugs.push(pool[Math.floor(Math.random() * pool.length)]);
      while (wonSlugs.length < P.myCards) { const all = [...bySlug.keys()]; if (!all.length) break; wonSlugs.push(all[Math.floor(Math.random() * all.length)]); }
      wonSlugs.forEach(sl => { if (bySlug.has(sl)) v.push({ slug: sl }); }); saveVault(v); }
    setTimeout(() => showResult(P, won, myRank, wonSlugs, finalOrder), 900);
  }
  function showResult(P, won, myRank, wonSlugs, order) {
    $('hud').classList.add('hidden'); $('ovResult').classList.add('show');
    $('resTitle').textContent = won ? 'WIN' : 'K.O.';
    $('resTag').textContent = won ? 'you won the duel' : 'cut down';
    if (!G.real) $('prizeBig').textContent = won ? '★ LAST BLADE STANDING' : 'DEFEATED';
    else $('prizeBig').textContent = won ? ('winner takes the pot · +' + P.myTok.toLocaleString('en-US') + ' $3030 · +' + wonSlugs.length + ' cards') : ('🔥' + P.anteBurn + ' rake burned · the pot went to the winner');
    $('prizeSub').textContent = won ? 'flawless intent — the ring is yours' : 'ante up and run it back';
    $('board').innerHTML = order.map((f, i) => `<div class="r${f.isMe ? ' me' : ''}"><span>${i + 1}. ${esc(f.name)}</span><span class="k">${f.dead ? 'K.O.' : 'WINNER ✦'}</span></div>`).join('');
    const wc = $('wonCards');
    wc.innerHTML = (won && G.real && wonSlugs.length) ? wonSlugs.slice(0, 12).map(sl => { const c = bySlug.get(sl); if (!c) return '';
      return `<div class="tile" style="--rc:var(${RC[c.rarity] || '--common'})"><img src="cards/${esc(c.art)}" alt="" loading="lazy"></div>`; }).join('') : '';
    $('scaNote').innerHTML = G.real
      ? 'Your <b>🔥' + P.anteBurn + ' $3030</b> rake burned on-chain — permanent, deflationary. The winner takes the rest of the pot + both staked hands; card winnings move for keeps in your vault. Real on-chain token-pot escrow ships with the <b>721 lens</b> — Phase-2.'
      : 'Practice duel — no tokens burned, no cards moved. Ante up with a signed wallet to duel for keeps.';
  }

  // ═════════ LOBBY ═════════
  let alobby = null;
  function initNet() { if (!window.RipNet) return;
    try { RipNet.join({ handle: myHandle(), cards: vault().length, balance: 0 });
      alobby = window.ArenaLobby ? ArenaLobby.mount('#arenaLobby', { mode: 'table', header: true }) : null;
      RipNet.setStatus('seeking'); RipNet.onLobby(ps => { if (alobby) alobby.update(ps || []); refreshPot(); }); } catch {}
  }
  function buildRoster() {
    const unl = unlocked(); let firstUnlocked = null; let count = 0;
    const host = $('roster'); host.innerHTML = '';
    ARCH_KEYS.forEach(k => { const a = ARCH[k], u = unl[k]; if (u.ok) { count++; if (!firstUnlocked) firstUnlocked = k; }
      const cell = document.createElement('div'); cell.className = 'fighter' + (u.ok ? '' : ' lock') + (wager.arch === k ? ' on' : '');
      cell.innerHTML = `<canvas width="120" height="128"></canvas><div class="fn">${a.name}</div><div class="fs">${a.blurb}</div>` + (u.ok ? '' : `<div class="lk">🔒 ${esc(u.need || 'locked')}</div>`);
      host.appendChild(cell); portrait(k, cell.querySelector('canvas'));
      if (u.ok) cell.onclick = () => { wager.arch = k; buildRoster(); };
    });
    // if current pick is locked, fall back
    if (!unl[wager.arch] || !unl[wager.arch].ok) wager.arch = firstUnlocked || 'ronin';
    $('unlockN').textContent = count;
  }
  function portrait(archKey, canvas) { try { RoninArt.portrait(canvas.getContext('2d'), archKey, ARCH[archKey]); } catch (e) { drawMini(canvas.getContext('2d'), archKey); } }
  function drawMini(c, archKey) {
    const a = ARCH[archKey]; c.clearRect(0, 0, 120, 128); c.save(); c.translate(60, 118);
    // legs
    c.strokeStyle = a.col; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -40); c.lineTo(-8, -20); c.lineTo(-10, 0); c.stroke();
    c.beginPath(); c.moveTo(0, -40); c.lineTo(9, -20); c.lineTo(11, 0); c.stroke();
    // torso
    c.strokeStyle = a.col; c.lineWidth = 11; c.shadowColor = a.tint; c.shadowBlur = 8; c.beginPath(); c.moveTo(0, -40); c.lineTo(2, -70); c.stroke(); c.shadowBlur = 0;
    // back arm
    c.strokeStyle = shade(a.col, -25); c.lineWidth = 7; c.beginPath(); c.moveTo(2, -68); c.lineTo(-8, -54); c.lineTo(-14, -40); c.stroke();
    // head + headband
    c.fillStyle = a.col; c.shadowColor = a.tint; c.shadowBlur = 8; c.beginPath(); c.arc(2, -82, 11, 0, 6.28); c.fill(); c.shadowBlur = 0;
    c.fillStyle = a.tint; c.fillRect(-9, -86, 22, 5);
    // front arm + drawn blade
    c.strokeStyle = a.col; c.lineWidth = 7; c.beginPath(); c.moveTo(2, -68); c.lineTo(14, -56); c.lineTo(22, -44); c.stroke();
    const wlen = { katana: 40, tanto: 26, nodachi: 54 }[a.weapon] || 40;
    c.strokeStyle = '#eaf6ff'; c.lineWidth = 3.5; c.shadowColor = a.tint; c.shadowBlur = 12; c.beginPath(); c.moveTo(22, -44); c.lineTo(22 + wlen * 0.5, -44 - wlen); c.stroke(); c.restore();
  }

  function buildGrid() {
    const own = ownedSlugs(); const groups = new Map(); own.forEach(s => groups.set(s, (groups.get(s) || 0) + 1));
    const g = $('cardGrid');
    g.innerHTML = [...groups.entries()].map(([sl, n]) => { const c = bySlug.get(sl); if (!c) return '';
      const on = wager.picked.filter(s => s === sl).length;
      return `<div class="tile${on ? ' sel' : ''}" data-slug="${esc(sl)}" style="--rc:var(${RC[c.rarity] || '--common'})"><img src="cards/${esc(c.art)}" alt="" loading="lazy"><span class="rr">${esc(c.rarity)}</span>${on ? `<span class="stk">×${on}</span>` : ''}${n > 1 ? `<span class="stk" style="left:3px;right:auto;color:#fff">${n}</span>` : ''}</div>`;
    }).join('') || '<div style="grid-column:1/-1;color:#a99;font-size:12px;padding:10px">No cards yet — <a href="index.html" style="color:var(--lime)">rip a pack</a>. You can still practice.</div>';
    g.querySelectorAll('.tile').forEach(el => el.onclick = () => { const sl = el.dataset.slug; const own2 = ownedSlugs();
      const have = own2.filter(s => s === sl).length, on = wager.picked.filter(s => s === sl).length;
      if (on >= have || wager.picked.length >= wager.cards) wager.picked = wager.picked.filter(s => s !== sl);
      else wager.picked.push(sl);
      while (wager.picked.length > wager.cards) wager.picked.shift();
      buildGrid(); refreshPot(); });
    if (window.CardHover) CardHover.bind(g, el => { const c = bySlug.get(el.dataset.slug); if (!c) return null; return { art: 'cards/' + c.art, title: c.title, rarity: c.rarity, atk: c.atk, def: c.def, trigger: c.trigger, color: `var(${RC[c.rarity] || '--common'})` }; });
    $('cardsInfo').textContent = `${own.length} owned · ${groups.size} kinds · ${wager.picked.length}/${wager.cards} in the pot`;
    refreshPot();
  }
  function refreshPot() {
    $('anteVal').textContent = wager.ante; $('cardsVal').textContent = wager.cards; $('pickN').textContent = wager.cards;
    const tokPot = wager.ante * wager.players, potBurn = Math.round(tokPot * WagerPayout.BURN_PCT), potNet = tokPot - potBurn, cardPot = wager.cards * wager.players;
    $('potLine').innerHTML = `POT · <b>${potNet.toLocaleString('en-US')}</b> $3030 + <span class="c">${cardPot}</span> cards <span style="opacity:.66;font-size:.85em">· 🔥${potBurn} burned · winner takes it</span>`;
    const Wt = window.RipWallet, canReal = liveToken() && Wt && Wt.hasWallet(), enough = wager.picked.length === wager.cards;
    $('btnAnte').disabled = !(canReal && enough);
    const note = $('lobNote');
    if (!canReal) note.innerHTML = 'Connect a signed wallet to ante real $3030. <b>Practice</b> is open to all.';
    else if (!enough) note.innerHTML = `Pick <b>${wager.cards}</b> card${wager.cards > 1 ? 's' : ''} for the pot to ante for keeps.`;
    else note.innerHTML = 'Ante <b>' + wager.ante + ' $3030</b> — <b>🔥' + WagerPayout.rake(wager.ante) + '</b> burns now, the rest joins the pot · <b>winner takes it</b>.';
  }
  document.querySelectorAll('[data-ante]').forEach(b => b.onclick = () => { wager.ante = clamp(wager.ante + (+b.dataset.ante) * 25, 0, 500); refreshPot(); });
  document.querySelectorAll('[data-cards]').forEach(b => b.onclick = () => { wager.cards = clamp(wager.cards + (+b.dataset.cards), 1, 5); wager.picked = wager.picked.slice(0, wager.cards); buildGrid(); });

  async function ante(rematch) { const Wt = window.RipWallet;
    if (!(liveToken() && Wt && Wt.hasWallet())) { startBrawl(false); return; }
    if (wager.picked.length !== wager.cards) { toast('Pick ' + wager.cards + ' cards first'); return; }
    const btn = rematch ? $('btnRematch') : $('btnAnte'); const label = btn.innerHTML; btn.innerHTML = 'confirm burn…'; btn.disabled = true;
    const r = await Wt.payRake(WagerPayout.rake(wager.ante)); btn.innerHTML = label; btn.disabled = false;
    if (!r.ok) { toast(Wt.explain ? Wt.explain(r.reason) : 'Burn failed'); return; }
    startBrawl(true);
  }
  const RN_CONTROLS = [
    { type: 'tap', act: 'Attack — Slash i16 · Kick i15 · Jab i10', touch: 'S / K / P buttons', key: 'Mouse L · R · Middle   (or L · K · J)' },
    { type: 'hold', act: 'Block — and it holds you in BLOCKSTUN', touch: 'Hold stick down', key: 'S · ↓' },
    { type: 'tap', act: 'RISING KICK — the launcher, −20 on block', touch: 'hold stick down + KICK', key: 'S + K' },
    { type: 'tap', act: 'THROW — beats block · 20f to break', touch: 'THROW button', key: 'G' },
    { type: 'tap', act: 'SIDESTEP — linear moves whiff, homing ones do not', touch: 'STEP button', key: 'Tap Q / E  (hold = strafe)' },
    { type: 'combo', act: 'Strings', touch: 'chain the buttons', key: 'S·S·S Tempest · P·K·S Crest · P·K Dragon' },
    { type: 'stick', act: 'Move · Jump', touch: 'Left stick · flick ↑', key: 'A D move · W jump' },
    { type: 'dtap', act: 'Dash', touch: 'Double-flick stick', key: 'Shift / dbl-tap A·D' },
    { type: 'dtap', act: 'Blade Nova (when the meter glows)', touch: 'SP button', key: 'Space' },
  ];
  /* ── THE MOVE LIST, rendered from MOVES ────────────────────────────────────────────────────
   * ⛔ A punish ladder nobody can read is not a game mechanic, it is trivia. This is the third
   * consumer of the one table (game · doc · lobby), and `npm run test:ronin` asserts the DOM it
   * produces matches the table cell for cell, so the page cannot show a stale number. */
  function buildMoveList() {
    const host = $('moveRows'); if (!host) return;
    host.innerHTML = MOVE_IDS.map(id => { const m = MOVES[id], p = punishersFor(id);
      const ob = m.onBlock == null ? '—' : (m.onBlock > 0 ? '+' : '') + m.onBlock;
      const oh = m.grab ? 'THROW' : m.launch ? 'LAUNCH' : m.knockdown ? 'KND' : (m.onHit > 0 ? '+' + m.onHit : String(m.onHit));
      const cls = m.onBlock == null ? '' : m.onBlock <= -15 ? ' bad' : m.onBlock <= -10 ? ' warn' : ' ok';
      return `<tr data-move="${id}"><td class="mn">${esc(m.name)}</td><td class="mi">${esc(m.input)}</td>`
        + `<td>i${m.st}</td><td>${m.ac}</td><td>${m.rc}</td><td>${m.dmg}</td>`
        + `<td class="adv${cls}">${ob}</td><td class="adv">${oh}</td>`
        + `<td class="pun">${p.length ? esc(p.map(x => MOVES[x].name).join(', ')) : '—'}</td></tr>`;
    }).join('');
    const n = $('moveNote');
    if (n) n.innerHTML = 'Frames at 60 fps. <b>on&nbsp;block = blockstun − (active−1) − recovery</b>, derived, never typed. '
      + 'A move at <b>−10</b> loses to the <b>' + MOVES.punch.name + ' (i' + MOVES.punch.st + ')</b>; at <b>−18</b> it loses to a '
      + '<b>launcher</b>, and a launcher means a juggle. Linear moves lose to a sidestep; homing ones do not. '
      + 'Full table and the reasoning live in <b>docs/RONIN-COMBAT.md</b>.';
  }
  function practice() { if (window.GameHelp) GameHelp.show({ title: 'NEON RONIN', kicker: '1v1 ninja duel', controls: RN_CONTROLS, startLabel: '▶ Start practice', onStart: () => startBrawl(false) }); else startBrawl(false); }
  $('btnPractice').onclick = practice;
  $('btnAnte').onclick = () => ante(false);
  $('btnRematch').onclick = () => { $('ovResult').classList.remove('show'); ante(true); };
  $('btnLobby').onclick = () => { $('ovResult').classList.remove('show'); $('ovLobby').classList.add('show'); buildRoster(); if (window.RipNet) { try { RipNet.setStatus('seeking'); } catch {} } };

  // ═════════ INPUT ═════════
  const lowHeld = () => !!(keys['s'] || keys['arrowdown'] || touch.block);   // S = guard = the launcher modifier
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = true;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (!G || G.mode !== 'play' || !G.started || G.me.dead) return; const me = G.me;
    if (!e.repeat && (k === 'a' || k === 'arrowleft')) checkDash(me, -1);          // double-tap → dash
    else if (!e.repeat && (k === 'd' || k === 'arrowright')) checkDash(me, 1);
    if (k === 'j') tryAttack(me, 'punch', { low: lowHeld() });
    else if (k === 'k') tryAttack(me, 'kick', { low: lowHeld() });                 // S+K → RISING KICK (launcher)
    else if (k === 'l') tryAttack(me, 'slash', { low: lowHeld() });
    else if (k === 'g' || k === 'f') tryThrow(me);                                 // G/F → NECK THROW
    else if (!e.repeat && (k === 'q')) trySidestep(me, -1);                        // TAP Q/E → committed SIDESTEP
    else if (!e.repeat && (k === 'e')) trySidestep(me, 1);                         //   (holding them still strafes)
    else if (k === 'w' || k === 'arrowup') tryJump(me); else if (k === ' ') trySpecial(me); else if (k === 'u') tryShuri(me);
    else if (!e.repeat && (k === 'shift')) { const dd = (keys['a'] || keys['arrowleft']) ? -1 : (keys['d'] || keys['arrowright']) ? 1 : me.face; tryDash(me, dd); }   // Shift = dash
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // ── desktop mouse combat: Left = Slash · Right = Kick · Middle = Punch (chain them for the same combos) ──
  const playing = () => G && G.mode === 'play' && G.started && G.me && !G.me.dead;
  const overUI = t => t && t.closest && t.closest('button, a, input, select, textarea, .pad, #ovLobby, #ovResult, #hud .top');
  addEventListener('mousedown', e => { if ((window.GameHelp && GameHelp.isTouch) || !playing() || overUI(e.target)) return;
    const low = lowHeld();
    if (e.button === 0) tryAttack(G.me, 'slash', { low }); else if (e.button === 2) tryAttack(G.me, 'kick', { low }); else if (e.button === 1) { e.preventDefault(); tryAttack(G.me, 'punch', { low }); } });
  addEventListener('contextmenu', e => { if (playing() && !overUI(e.target)) e.preventDefault(); });

  // touch: floating left move-stick (drag = move, flick up = jump, hold-down = block) + right action pads
  const isTouch = (window.GameHelp && GameHelp.isTouch);
  if (isTouch) {
    document.body.classList.add('touch');
    const sB = $('stikBase'), sN = $('stikNub'); let sid = null, cx0 = 0, cy0 = 0;
    cv.addEventListener('touchstart', e => { for (const t of e.changedTouches) { if (t.clientX < innerWidth * 0.46 && sid == null) { sid = t.identifier; cx0 = t.clientX; cy0 = t.clientY;
      sB.style.display = sN.style.display = 'block'; sB.style.left = sN.style.left = cx0 + 'px'; sB.style.top = sN.style.top = cy0 + 'px'; } } }, { passive: true });
    cv.addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === sid) { const dx = t.clientX - cx0, dy = t.clientY - cy0;
      touch.mx = clamp(dx / 52, -1, 1); touch.block = dy > 34 && Math.abs(dx) < 40;
      if (G && G.worldMode) { touch.mz = clamp(dy / 52, -1, 1); touch.block = false; }   // world mode: full 2-axis stick
      if (dy < -40 && G && G.started && !G.me.dead) { tryJump(G.me); cy0 = t.clientY; }
      const R = 52, m = Math.hypot(dx, dy), k = m > R ? R / m : 1; sN.style.left = (cx0 + dx * k) + 'px'; sN.style.top = (cy0 + dy * k) + 'px'; } }, { passive: true });
    const endT = e => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; touch.mx = 0; touch.mz = 0; touch.block = false; sB.style.display = sN.style.display = 'none'; } };
    cv.addEventListener('touchend', endT); cv.addEventListener('touchcancel', endT);
    const pad = (id, fn) => { const el = $(id); if (!el) return; el.addEventListener('touchstart', e => { e.preventDefault(); el.classList.add('dn'); if (G && G.started && !G.me.dead) fn(); }, { passive: false }); const up = () => el.classList.remove('dn'); el.addEventListener('touchend', up); el.addEventListener('touchcancel', up); };
    /* ⛔ BUILT ≠ REACHABLE (ROADMAP §5.3). Every new verb gets a touch surface here or it does
     * not exist on a phone: THROW is its own pad, STEP is its own pad, and RISING KICK is
     * "hold the stick down + KICK", which the two-finger layout already supports because block
     * lives on the stick and the attacks live on pads. All pads are ≥ 44 px (mobile.css rule). */
    pad('padP', () => tryAttack(G.me, 'punch', { low: touch.block })); pad('padK', () => tryAttack(G.me, 'kick', { low: touch.block })); pad('padS', () => tryAttack(G.me, 'slash', { low: touch.block }));
    pad('padX', () => trySpecial(G.me)); pad('padShuri', () => tryShuri(G.me));
    pad('padG', () => tryThrow(G.me));
    pad('padE', () => trySidestep(G.me, (G.me.z || 0) > 0 ? -1 : 1));
  }

  // ── SFX (tiny WebAudio, unlocked by the ante/practice tap) ──
  let AC = null; function ac() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch { AC = null; } return AC; }
  function tone(f0, f1, d, type, g) { const c = ac(); if (!c) return; try { const o = c.createOscillator(), gain = c.createGain(), t = c.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + d);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(g || 0.05, t + 0.006); gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gain).connect(c.destination); o.start(t); o.stop(t + d + 0.02); } catch {} }
  function nz(d, g) { const c = ac(); if (!c) return; try { const n = c.sampleRate * d | 0, b = c.createBuffer(1, n, c.sampleRate), dt = b.getChannelData(0);
    for (let i = 0; i < n; i++) dt[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(), gg = c.createGain(); s.buffer = b; gg.gain.value = g || 0.1; s.connect(gg).connect(c.destination); s.start(); } catch {} }
  const sfxWhiff = () => tone(300, 160, 0.08, 'sawtooth', 0.03), sfxSlash = () => tone(900, 300, 0.12, 'sawtooth', 0.05),
    sfxHit = kd => { tone(180, 70, kd ? 0.16 : 0.08, 'square', 0.06); nz(0.06, 0.08); }, sfxBlock = () => tone(600, 500, 0.07, 'square', 0.04),
    sfxKo = () => { tone(260, 50, 0.4, 'square', 0.07); nz(0.3, 0.12); }, sfxShuri = () => tone(1200, 700, 0.09, 'triangle', 0.03),
    sfxPick = () => tone(500, 1000, 0.14, 'sine', 0.045), sfxSpecial = () => { tone(200, 1400, 0.3, 'sawtooth', 0.06); nz(0.2, 0.09); },
    sfxGong = () => tone(400, 120, 0.35, 'sine', 0.06);

  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 900); }

  // ═════════ BOOT ═════════
  window.__rn = { get s() { return G && G.mode !== 'lobby' ? { mode: G.mode, started: G.started, alive: G.fighters.filter(f => !f.dead).length, hp: G.me.hp | 0, myKos: G.me.kos, meter: +G.me.meter.toFixed(2), t: +G.t.toFixed(1) } : { lobby: true, arch: wager.arch }; },
    _hit() { if (G && G.me) tryAttack(G.me, 'slash'); }, get fighters() { return G && G.fighters; },
    // headless-test drivers (rAF is throttled in CI; step the sim directly)
    _brawl(meK, foeK) { startBrawl(false, meK, foeK); }, _start() { if (G) { G.started = true; const cd = $('cd'); if (cd) cd.classList.add('hidden'); } },
    /* ⚑ ONE FRAME IS 1/60, NOT 0.016. The old default drifted 4% per step, which is fine for a
     * screenshot and useless for measuring an advantage in frames. `dt` is overridable so a
     * caller can still be explicit. */
    _step(n, dt) { if (!G) return; const d = dt == null ? F : dt; for (let i = 0; i < (n || 1); i++) update(d); },
    _rosterUnlocked() { const u = unlocked(); return Object.keys(u).filter(k => u[k].ok); },

    /* ── the combat lab. Everything `npm run test:ronin` needs, and nothing it could fake with.
     * `_lab(true)` turns off HITSTOP only — hitstop scales dt for BOTH fighters so it does not
     * change advantage, but it does decouple sim frames from driven steps, and a measurement
     * whose clock wanders is not a measurement. */
    get frames() { const o = {}; for (const id of MOVE_IDS) { const m = MOVES[id];
      o[id] = { name: m.name, input: m.input, st: m.st, ac: m.ac, rc: m.rc, dmg: m.dmg, bs: m.bs, hs: m.hs,
        onBlock: m.onBlock, onHit: m.onHit, homing: !!m.homing, launch: !!m.launch, knockdown: !!m.knockdown,
        bound: !!m.bound, chLaunch: !!m.chLaunch, grab: !!m.grab,
        punishedBy: punishersFor(id).map(p => MOVES[p].name) }; } return o; },
    get consts() { return { FPS, HP_SCALE, JSCALE: JSCALE.slice(), JUG_G, LAUNCH_V, JUG_MAX, DOWN_F, GETUP_F,
      THROW_BREAK, THROW_HOLD, SSTEP: Object.assign({}, SSTEP), react: AI_S.react }; },
    _lab(on) { if (G) G.__lab = on !== false; },
    get jug() { return { JUG_MAX, JUG_SPIKE, REFLOAT: [0,1,2,3,4,5,6].map(REFLOAT) }; },
    _do(who, id) { const f = who === 'foe' ? G.foe : G.me; if (!canAct(f)) return false; return startMove(f, id); },
    /* the input buffer, exposed: queue a move and it fires on the first actionable frame — which
     * is the ONLY way to land a frame-perfect punish, from a harness or from a human thumb. */
    _buf(who, id) { const f = who === 'foe' ? G.foe : G.me; f.buf = { id, t: 0 }; },
    _seq(who, kinds) { const f = who === 'foe' ? G.foe : G.me; f.seq = kinds.map((k, i) => ({ k, t: G.t - 0.1 * (kinds.length - i) })); },
    _press(who, kind, low) { const f = who === 'foe' ? G.foe : G.me; tryAttack(f, kind, { low: !!low }); },
    _step_(who, dir) { const f = who === 'foe' ? G.foe : G.me; trySidestep(f, dir); },
    _throw(who) { const f = who === 'foe' ? G.foe : G.me; tryThrow(f); },
    _break(who) { const f = who === 'foe' ? G.foe : G.me; return tryBreak(f); },
    _guard(who, on) { const f = who === 'foe' ? G.foe : G.me; f.aiHold = on; if (on) { if (canAct(f)) f.state = 'block'; } else if (f.state === 'block' && f.bstun <= 0) f.state = 'idle'; },
    _ai(who, on) { const f = who === 'foe' ? G.foe : G.me; f.noAI = !on; f.forceAI = !!on; },
    _place(ax, bx, az, bz) { if (!G) return; G.me.x = ax; G.foe.x = bx; if (az != null) G.me.z = az; if (bz != null) G.foe.z = bz;
      G.me.vx = G.foe.vx = 0; G.me.zv = G.foe.zv = 0; G.me.face = 1; G.foe.face = -1; },
    _reset() { if (!G) return; [G.me, G.foe].forEach(f => { f.hp = f.maxHp; f.swing = null; f.step = null; f.grab = null; f.thrown = null;
      f.stun = 0; f.bstun = 0; f.downT = 0; f.juggle = null; f.invuln = 0; f.state = 'idle'; f.stT = 0; f.air = false; f.yLift = 0;
      f.vx = 0; f.vy = 0; f.z = 0; f.zv = 0; f.seq = []; f.meter = 0; f.combo = 0; f.spinT = 0; f.spin = 0;
      f.guardT = 0; f.ch = 0; f.aiHold = false; f.noAI = true; f.forceAI = false; f.dead = false; f.ragdoll = false;
      f.stepCd = 0; f.buf = null; f.move = null; f.minus = null; f.blockedRun = 0; f.aiT = 0; f.aiMove = 0; f.aiStrafe = 0; });
      /* ⚠ AND THE MATCH. A KO during an earlier measurement calls endBrawl, which sets
       * G.started = false — after which stepAI never runs again and every later 'the bots
       * play the new game' number silently reads ZERO. It looked like an AI that ignored
       * the system; it was a harness measuring a finished match. */
      G.hitstop = 0; G.mode = 'play'; G.started = true; G.timeLeft = 90; G.order = []; G.camZoom = 0;
      const ov = $('ovResult'); if (ov) ov.classList.remove('show'); },
    get st() { const p = f => ({ state: f.state, move: f.move || null, hp: +f.hp.toFixed(2), maxHp: f.maxHp,
      free: +framesUntilFree(f).toFixed(3), canAct: canAct(f), air: f.air, y: +f.yLift.toFixed(1), z: +(f.z || 0).toFixed(1),
      juggle: f.juggle ? { hits: f.juggle.hits, bound: f.juggle.bound } : null, thrown: !!f.thrown, grabbing: !!f.grab,
      stun: +f.stun.toFixed(4), bstun: +f.bstun.toFixed(4), down: +f.downT.toFixed(4), stepping: !!f.step, ch: f.ch > 0 });
      return G ? { me: p(G.me), foe: p(G.foe), t: +G.t.toFixed(3) } : null; } };
  try { if (window.RoninGL && RoninGL.init($('glcv'))) { glOk = true; $('glcv').style.display = 'block'; } } catch (e) { glOk = false; }
  // prefer the true-3D renderer when WebGL is available; the 2D + bloom path is the fallback
  try { if (window.Ronin3D && Ronin3D.init($('cv3d'))) r3dOk = true; } catch (e) { r3dOk = false; }
  // optional modelled fighters: drop <arch>.glb into models/ and it replaces the procedural body.
  // Missing files are expected and silent — the procedural fighters stay the default.
  // ── device budget: the baked city (6 MB) + skinned fighters (5 MB) are far too heavy for a
  //    phone, and were breaking mobile outright. Small screens / low-core / low-memory devices
  //    keep the lightweight procedural arena, which has always worked there. ──
  // ⚑ SHELVED: free-roam city mode is parked for a future game. The code stays (movement,
  //   collision, chase cam all work) but NEON RONIN ships as the duel. Opt in with
  //   localStorage urm_world='1' to keep developing it.
  let WORLD_ON = false; try { WORLD_ON = localStorage.getItem('urm_world') === '1'; } catch (e) {}
  // The device budget is asked separately from the world flag: the lobby's arena picker needs
  // to know "could this machine run a 3D level?" even while the flag is off, or every chip
  // would read as unavailable on a perfectly capable desktop.
  const DEVICE_OK = (() => { try {
    if (window.GameHelp && GameHelp.isTouch) return false;
    if (Math.min(innerWidth, innerHeight) < 700) return false;
    if ((navigator.hardwareConcurrency || 4) < 4) return false;
    if ((navigator.deviceMemory || 4) < 4) return false;
    if (navigator.connection && navigator.connection.saveData) return false;
    return true; } catch (e) { return false; } })();
  const HEAVY_OK = WORLD_ON && DEVICE_OK;
  /* Modelled fighters used to ride HEAVY_OK too, which meant a .skn only loaded if you had
   * also opted into the shelved free-roam city — two unrelated things behind one switch, so
   * the rigged characters never appeared in the duel they were made for. They now have their
   * own opt-in and only share the device budget, which is what they actually need (ronin.skn
   * is 5.7 MB). Default stays procedural: the shipping duel keeps the look it has today, and
   * modelled bodies are one click away in the lobby. */
  // Modelled bodies are the fighters now — the procedural mannequins were the placeholder that
  // stood in until real geometry existed, and it does. No toggle: one look, one thing to test.
  // DEVICE_OK still applies, because the set is ~7 MB and a phone should not fetch it.
  const FIGHTERS_OK = DEVICE_OK;
  window.__rnHeavy = HEAVY_OK; window.__rnDeviceOk = DEVICE_OK;

  /* ── ARENA picker ────────────────────────────────────────────────────────────────────────
   * The built levels sat behind two localStorage flags, which is the same as not shipping
   * them — nobody opens a console to find content. This puts them in the lobby next to the
   * fighter roster. Changing arena reloads: the world mesh is uploaded once at init, so
   * swapping it live would mean tearing down and rebuilding the renderer's world buffer for
   * no gain over a page load. */
  (function arenaPicker() {
    const box = $('levelChips'); if (!box) return;
    const LEVELS = [{ k: '', n: 'Neon grid' }, { k: 'rooftop', n: 'Rooftop' },
                    { k: 'arcade', n: 'Arcade' }, { k: 'vault', n: 'Vault' }];
    let cur = '';
    try { cur = WORLD_ON ? (localStorage.getItem('urm_level') || 'street') : ''; } catch (e) {}
    box.innerHTML = LEVELS.map(l => '<span class="achip' + (l.k === cur ? ' on' : '') +
      (!DEVICE_OK && l.k ? ' off' : '') + '" data-k="' + l.k + '">' + l.n + '</span>').join('');
    const note = $('levelNote');
    if (note) note.textContent = DEVICE_OK
      ? 'Neon grid is the classic flat duel. The others are full 3D levels you move through — WASD, Shift to sprint, Space to jump/boost.'
      : 'Full 3D levels need a desktop-class device, so this stays on the neon grid.';
    box.querySelectorAll('.achip').forEach(el => el.onclick = () => {
      const k = el.dataset.k;
      if (k && !DEVICE_OK) return;
      try {
        if (k) { localStorage.setItem('urm_world', '1'); localStorage.setItem('urm_level', k); }
        else localStorage.removeItem('urm_world');
      } catch (e) {}
      location.reload();
    });

  })();

  // WORLD: load the baked level if present — the duel gets a real place to happen in.
  // Levels are built by `npm run level -- <name>` (scripts/blender/build-level.py → .wld);
  // pick one with localStorage urm_level, and an unknown name just falls back to the street.
  let LEVEL = 'street';
  try { LEVEL = (localStorage.getItem('urm_level') || 'street').replace(/[^a-z0-9_-]/gi, ''); } catch (e) {}
  if (HEAVY_OK && r3dOk && window.RoninWorld) RoninWorld.load('models/world/' + LEVEL + '.wld')
    .then(w => { if (w && w.verts) Ronin3D.setWorld(w.verts); })
    .catch(() => RoninWorld.load('models/world/street.wld')
      .then(w => { if (w && w.verts) Ronin3D.setWorld(w.verts); }).catch(() => {}));
  /* SKINNED fighters (.skn = real vertex deformation) take priority over rigid parts.
   * ⛔ AND "TAKE PRIORITY" IS ABSOLUTE, WHICH IS WHY THE RIGID LOAD IS NOW CHAINED ONTO THIS ONE'S
   *    FAILURE. `js/ronin3d.js` drawFighter reads
   *        if (skins[f.arch]) { drawSkinned(...); return; }
   *        if (models[f.arch]) { drawModelFighter(...); return; }
   *    — the skin wins before the model is ever consulted. All 13 ARCH_KEYS have a `models/*.skn`
   *    on disk, so the old unconditional second pass fetched 13 `.glb` (all 404) and then 13
   *    `.obj`, of which `ronin.obj` (6.6 MB) and `oni.obj` (2.5 MB) SUCCEED — 9.1 MB downloaded,
   *    parsed and registered into `models[]`, which the draw path can never reach. Built,
   *    fetched, and still unreachable (ROADMAP §5.3). Measured: 25 guaranteed-404 requests on
   *    every desktop load, which is also where a real 404 was hiding.
   * ⚑ The drop-in hook is PRESERVED exactly: an archetype with no `.skn` still falls through to
   *    `<arch>.glb` → `<arch>.obj` and still replaces the procedural body. Nothing that could be
   *    drawn before stops being drawn; only fetches whose result was undrawable are dropped. */
  const rigid = k => {
    const tryGlb = window.RoninGLB ? RoninGLB.load('models/' + k + '.glb') : Promise.reject();
    return tryGlb.catch(() => window.RoninOBJ ? RoninOBJ.load('models/' + k + '.obj') : Promise.reject())
      .then(m => { if (m) Ronin3D.registerModel(k, m); }).catch(() => {});
  };
  if (FIGHTERS_OK && r3dOk) ARCH_KEYS.forEach(k => {
    fetch('models/' + k + '.skn').then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(buf => {
      const dv = new DataView(buf);
      if (new TextDecoder().decode(new Uint8Array(buf, 0, 8)) !== 'UR3SKIN0') throw 0;
      const ver = dv.getUint32(8, true), n = dv.getUint32(12, true);
      /* ⚑ VERTEX DATA STARTS AT 296 IN A v2 .skn, NOT 32. v2 ships the bind skeleton inside the
       * file (11 bones × [startXYZ, endXYZ] = 264 bytes at offset 32) — see bake-fighter.mjs and
       * js/section9-skin.js, which have always read it correctly. This reader did not, and 264
       * is not a multiple of the 56-byte stride, so it did not fail loudly: it slid EVERY vertex
       * 4.71 vertices along, shuffling position into normal into bone index. `oni.skn` and
       * `ronin.skn` became v2 with task #77, so two of NEON RONIN's six fighters have been
       * loading as noise since. An offset bug in a binary format never throws; it just draws
       * something wrong, which is why the length is asserted here rather than assumed. */
      const off = ver >= 2 ? 32 + 11 * 6 * 4 : 32;
      if (off + n * 56 > buf.byteLength) throw 0;
      if (!Ronin3D.registerSkin(k, new Float32Array(buf, off, n * 14), n)) throw 0;
    }).catch(() => rigid(k));      // no skin for this arch → the rigid-part drop-in still applies
  });
  if (r3dOk) { glOk = false; const g = $('glcv'); if (g) g.style.display = 'none'; $('cv3d').style.display = 'block'; $('cv').style.display = 'none'; }
  buildMoveList();                                            // frame data is available before the deck loads
  loadDeck().then(() => { buildRoster(); buildGrid(); initNet(); });
  if (window.RipWallet) { try { RipWallet.on(() => refreshPot()); } catch {} }
})();

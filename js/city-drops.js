/* ripmaster3030studios — THE CITY · DROPS. What the bird leaves and the squirrel takes.
 *
 * Artist, 2026-08-03: *"have the birds poop out and place power ups and squirrels and carry power
 * ups and steal them haha"*
 *
 * ⛔ THIS IS THE FIRST TIME THE ANIMAL LAYERS ACTUALLY TOUCH EACH OTHER, and that is why it is
 *   worth more than it looks. `docs/CITY-GAME.md` §1 says the animals are LAYERS, not skins —
 *   the bird SCOUTS and the others REACH — but until now that was a claim about what each one
 *   could see. A bird that PLANTS and a squirrel that TAKES makes it a claim about what each one
 *   can DO TO THE OTHER, which is the difference between a roster and a game.
 *
 * ⚑ THE JOKE IS THE MECHANIC, and that is the good kind of design. A drop comes out of the bird
 *   and FALLS: you cannot place it precisely, you have to fly over the right spot and let go. So
 *   the bird's advantage — seeing the whole map — is spent as a real decision, and its
 *   disadvantage — no fine control — is the cost. Neither had to be balanced; the physics did it.
 *
 * ⚑ AND A DROP IS A CARD, because in this studio it could not be anything else. The trading card
 *   is a SIZE before it is anything (the artist's own frame), so a flat rectangle IS the correct
 *   primitive here — this is the one place in the project where reaching for `box` is right
 *   rather than lazy, and the distinction is the whole of DESIGN-SYSTEM §1.
 *
 * ⚠ NOTHING HERE MOVES ON ITS OWN AT REST. A landed card sits still; the settle after a landing is
 *   caused by the landing. A spinning pickup is a screensaver, and the standing rule in this repo
 *   is that stillness is the default (DESIGN-SYSTEM §4).
 *
 *   CityDrops.create(app, parent, { collide, makeSquirrel }) -> api
 */
window.CityDrops = (function () {
  'use strict';

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* Four kinds, and they are named for what they are in this world rather than for a stat. The
   * colour is the identification — in a posterised city a flat saturated field IS the icon. */
  const KINDS = [
    { id: 'rip',   name: 'RIP',   col: [0.86, 0.24, 0.18] },
    { id: 'foil',  name: 'FOIL',  col: [0.11, 0.62, 0.66] },
    { id: 'lens',  name: 'LENS',  col: [0.96, 0.72, 0.16] },
    { id: 'ash',   name: 'ASH',   col: [0.24, 0.26, 0.34] },
  ];

  const GRAV = 19;
  const CARD = { w: 0.34, h: 0.48, t: 0.035 };
  const TAKE_R = 1.05;          // how close a squirrel must be to take a loose card
  const STEAL_R = 1.35;         // …and to take one off somebody who is already carrying

  function create(app, parent, opts) {
    opts = opts || {};
    const collide = opts.collide || null;
    const makeSquirrel = opts.makeSquirrel || null;
    const drops = [], rivals = [];
    let carried = null;                       // the PLAYER's card, or null
    const log = { dropped: 0, landed: 0, taken: 0, stolen: 0, lost: 0 };

    const mats = {};
    for (const k of KINDS) {
      const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(k.col[0], k.col[1], k.col[2]);
      m.useMetalness = true; m.metalness = 0; m.gloss = 0.30;
      /* A faint emissive so a card in a shadowed alley is still findable. ⚠ Not a glow — a glowing
       * pickup is a video-game icon, and this city is trying to be a printed place. */
      m.emissive = new pc.Color(k.col[0] * 0.22, k.col[1] * 0.22, k.col[2] * 0.22);
      m.update();
      mats[k.id] = m;
    }
    const backMat = (() => { const m = new pc.StandardMaterial();
      m.diffuse = new pc.Color(0.93, 0.89, 0.79); m.useMetalness = true; m.metalness = 0;
      m.gloss = 0.22; m.update(); return m; })();

    function cardEntity(kind) {
      const e = new pc.Entity('drop');
      const face = new pc.Entity('face');
      face.addComponent('render', { type: 'box' });
      face.setLocalScale(CARD.w, CARD.h, CARD.t);
      face.render.meshInstances.forEach(mi => { mi.material = mats[kind.id]; });
      e.addChild(face);
      // the back is cream — a card has two sides, and that is the artist's own first principle
      const back = new pc.Entity('back');
      back.addComponent('render', { type: 'box' });
      back.setLocalScale(CARD.w * 0.94, CARD.h * 0.94, CARD.t * 0.5);
      back.setLocalPosition(0, 0, -CARD.t * 0.6);
      back.render.meshInstances.forEach(mi => { mi.material = backMat; });
      e.addChild(back);
      parent.addChild(e);
      return e;
    }

    /* ── THE DROP ────────────────────────────────────────────────────────────────────────────
     * Tossed slightly BACKWARD and down, because that is where it comes from and because a card
     * that leaves forward would out-run the bird and land ahead of it, which is neither funny nor
     * useful. Inherits the bird's horizontal velocity, or it appears to fall out of a stationary
     * sky while the bird flies on. */
    /* ── ⛔ THE POUCH. THE BIRD CANNOT MINT A CARD FROM NOTHING ───────────────────────────────
     * Artist, 2026-08-05: *"there is a bug for squirrel and bird. both cannot drop power ups.
     * unlimited power ups."*
     *
     * ⛔ MEASURED: 100 presses produced 106 cards. `drop()` conjured one on every press with no
     *   bound of any kind, so a minute of holding the key carpets a 3.84 km city and the pick-up
     *   loop — the squirrel's whole reason to exist — becomes pointless. **Scarcity is not a
     *   balance knob here, it is the mechanic**: a steal needs something worth stealing.
     * ⛔ AND THE TWO HALVES OF THE REPORT HAVE ONE ROOT. The squirrel returns null unless it is
     *   carrying, the bird always succeeded but tosses the card BACKWARD and DOWN — behind the
     *   chase camera, off-screen. So one animal did nothing and the other did something you could
     *   not see, and **both read as "the drop is broken"**. Nothing anywhere reported either.
     * ⚑ SO CARDS COME FROM THE WORLD AND GO BACK TO IT. The bird carries a small pouch, fills it
     *   by flying low over loose cards — the same reach the squirrel takes with, so one rule
     *   covers both — and `drop()` refuses when it is empty. That closes the loop the game
     *   already had: the squirrel steals, the bird plants, and neither creates supply. */
    const POUCH_MAX = 5;
    let pouch = 3;
    function drop(x, y, z, vx, vz, kindId) {
      if (pouch <= 0) return null;              // ⚠ refuses, and the caller says so out loud
      pouch--;
      const kind = kindId ? (KINDS.find(k => k.id === kindId) || KINDS[0])
                          : KINDS[(Math.abs((x * 31 + z * 17) | 0)) % KINDS.length];
      const d = { x, y: y - 0.12, z, vx: vx * 0.55, vy: -0.6, vz: vz * 0.55,
                  kind, landed: false, settle: 0, held: null, ent: cardEntity(kind), spin: 0 };
      drops.push(d);
      log.dropped++;
      return d;
    }

    /* ── RIVAL SQUIRRELS — the other end of "steal them" ─────────────────────────────────────
     * ⚑ A steal needs somebody to steal FROM, so the rivals are not decoration: they are the
     *   mechanic's other half. They want the same cards you do, they are slower than you, and
     *   they carry exactly one — so a chase is always winnable and never free.
     * ⚠ They are the first thing in this city that is ALIVE, which the brief lists as an open
     *   question ("is there anyone else in it?"). This answers it in the mellow direction: yes,
     *   and they want your stuff, and that is the entire conflict. */
    function addRival(x, z, y) {
      const body = makeSquirrel ? makeSquirrel(0.82) : null;
      if (!body) return null;
      parent.addChild(body);
      const r = { x, y: y == null ? 0 : y, z, vy: 0, yaw: Math.random() * 6.28,
                  ent: body, holding: null, cool: 0, target: null, onGround: false };
      rivals.push(r);
      return r;
    }

    function groundAt(x, z, y) {
      if (!collide) return 0;
      const g = collide.groundBelow(x, z, y, 0.3, 400);
      return g == null ? null : g;
    }

    function step(dt, player) {
      // ── falling cards
      for (const d of drops) {
        if (d.held) {
          const h = d.held;
          d.x = h.x; d.z = h.z; d.y = (h.y || 0) + (h.carryY || 0.30);
          d.ent.setPosition(d.x, d.y, d.z);
          d.ent.setEulerAngles(0, (h.yaw || 0) * 180 / Math.PI, 18);
          continue;
        }
        if (!d.landed) {
          d.vy -= GRAV * dt;
          d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt;
          d.spin += dt * 3.2;
          const g = groundAt(d.x, d.z, d.y);
          if (g != null && d.y <= g + 0.06) {
            d.y = g + 0.06; d.landed = true; d.settle = 1; log.landed++;
          } else if (d.y < -40) { d.landed = true; d.y = -40; }     // never fall forever
        } else {
          /* the settle is caused by the landing and decays to nothing — it is not a loop */
          d.settle = Math.max(0, d.settle - dt * 2.6);
        }
        d.ent.setPosition(d.x, d.y, d.z);
        d.ent.setEulerAngles(d.landed ? 90 - d.settle * 26 : d.spin * 57, d.spin * 31, 0);
      }

      // ── rivals: go for the nearest loose card, carry it, wander
      for (const r of rivals) {
        r.cool = Math.max(0, r.cool - dt);
        if (!r.holding) {
          let best = null, bd = 1e9;
          for (const d of drops) {
            if (d.held || !d.landed) continue;
            const dd = (d.x - r.x) * (d.x - r.x) + (d.z - r.z) * (d.z - r.z);
            if (dd < bd) { bd = dd; best = d; }
          }
          r.target = (best && bd < 40 * 40) ? best : null;
        } else r.target = null;

        let wx = 0, wz = 0;
        if (r.target) { wx = r.target.x - r.x; wz = r.target.z - r.z; }
        else { wx = Math.sin(r.yaw); wz = Math.cos(r.yaw); }
        const L = Math.hypot(wx, wz) || 1;
        const SP = r.holding ? 3.4 : 4.6;                 // a full mouth slows you down
        r.yaw = Math.atan2(wx / L, wz / L);
        const nx = r.x + (wx / L) * SP * dt, nz = r.z + (wz / L) * SP * dt;
        if (!collide || !collide.hits(nx, r.y + 0.3, nz, 0.24, 0.4)) { r.x = nx; r.z = nz; }
        else r.yaw += 2.2 * dt;                            // bounce off and try elsewhere
        const g = groundAt(r.x, r.z, r.y + 1.2);
        r.y = g == null ? r.y - 6 * dt : g;
        r.carryY = 0.46;      // clear of the back — see the note in city-app.js
        if (r.target && Math.hypot(r.target.x - r.x, r.target.z - r.z) < TAKE_R) {
          r.target.held = r; r.holding = r.target; r.target = null;
        }
        r.ent.setPosition(r.x, r.y, r.z);
        r.ent.setEulerAngles(0, r.yaw * 180 / Math.PI, 0);
      }

      // ── the player
      if (!player) return;
      if (player.mode === 'squirrel') {
        player.carryY = 0.30;
        if (!carried) {
          for (const d of drops) {
            if (d.held || !d.landed) continue;
            if (Math.hypot(d.x - player.x, d.z - player.z) < TAKE_R &&
                Math.abs(d.y - player.y) < 1.6) { d.held = player; carried = d; log.taken++; break; }
          }
        }
        if (!carried) {
          /* ⚑ THE STEAL. Range is deliberately LARGER than the pick-up range — taking something
           * off somebody should be the easier action once you have caught them, because the hard
           * part was catching them. Balancing it the other way makes the chase pointless. */
          for (const r of rivals) {
            if (!r.holding) continue;
            if (Math.hypot(r.x - player.x, r.z - player.z) < STEAL_R &&
                Math.abs(r.y - player.y) < 1.8) {
              const d = r.holding; r.holding = null; r.cool = 2.2;
              d.held = player; carried = d; log.stolen++; break;
            }
          }
        }
      } else if (carried && player.mode !== 'squirrel') {
        carried.held = null; carried.landed = false; carried.vy = 0;
        carried.vx = carried.vz = 0; carried = null; log.lost++;
      }
      /* ⚑ THE BIRD REFILLS BY FLYING LOW OVER A LOOSE CARD — the pouch's only source, which is
       *   what keeps supply closed. ⚠ The vertical reach is generous (2.4 m against the
       *   squirrel's 1.6) because a bird arrives with speed and cannot hover onto a spot; asking
       *   for the squirrel's precision from something that glides is asking for a control the
       *   bird does not have. Its whole trade is "sees everything, places nothing exactly". */
      if (player.mode === 'bird' && pouch < POUCH_MAX) {
        for (const d of drops) {
          if (d.held || !d.landed) continue;
          if (Math.hypot(d.x - player.x, d.z - player.z) < TAKE_R * 1.6 &&
              Math.abs(d.y - player.y) < 2.4) {
            const i = drops.indexOf(d);
            if (i >= 0) { if (d.ent && d.ent.destroy) { try { d.ent.destroy(); } catch (e) {} }
                          drops.splice(i, 1); }
            pouch++; log.taken++;
            break;                              // one per frame, so a low pass is a pass, not a hoover
          }
        }
      }
    }

    function dropCarried(player) {
      if (!carried) return null;
      const d = carried; carried = null;
      d.held = null; d.landed = false; d.vy = 0.4;
      d.vx = Math.sin(player.yaw || 0) * 1.4; d.vz = Math.cos(player.yaw || 0) * 1.4;
      return d;
    }

    function seed(x, z, n) {
      /* A handful of rivals near where you start, so the mechanic exists the moment you arrive
       * rather than after a walk. ⚠ Placed on real ground, read from the collider — the same rule
       * the player's own spawn had to learn. */
      for (let i = 0; i < (n || 3); i++) {
        const a = i / (n || 3) * 6.283, R = 14 + i * 5;
        const px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R;
        const g = groundAt(px, pz, 60);
        addRival(px, pz, g == null ? 0 : g);
      }
    }

    return {
      drop, dropCarried, step, seed, addRival, KINDS,
      get carried() { return carried; },
      get pouch() { return pouch; },
      get pouchMax() { return POUCH_MAX; },
      get counts() {
        let loose = 0, held = 0, flying = 0;
        for (const d of drops) { if (!d.landed) flying++; else if (d.held) held++; else loose++; }
        return { total: drops.length, loose, held, flying, pouch, pouchMax: POUCH_MAX,
                 rivals: rivals.length, rivalsHolding: rivals.filter(r => r.holding).length,
                 carried: carried ? carried.kind.name : null, ...log };
      },
      get drops() { return drops; },
      get rivals() { return rivals; },
    };
  }

  return { create, KINDS };
})();

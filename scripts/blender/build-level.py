# upperdeckripmaster3030 — level builder.
#
#   blender --background --factory-startup -noaudio -P scripts/blender/build-level.py -- <name> <out.obj> [seed]
#
# Usually driven by `npm run level -- arcade`, which also bakes the OBJ into the .wld the game
# loads. See scripts/blender/kit.py for the primitives and why levels are authored in code.
#
# ── the three levels, and why these three ──────────────────────────────────────────────────
# The artist's throughline is MAD magazine and cereal boxes → the casino and the arcade → the
# auction. All three are the same machine: a thing that promises you win something tangible.
# So the levels are those rooms, in that order.
#
#   ARCADE   the machine itself — rows of cabinets, a claw crane you will not beat, a change
#            booth. The anti-casino: the prize is having played.
#   VAULT    the auction — plinths under glass, a rostrum, a vault door. The promise of value
#            received, arranged as furniture.
#   ROOFTOP  where the duel actually happens. Water tower, billboard, catwalk, a skyline you
#            can land on rather than one painted behind you.
#   LIDO     the sunny one, and the first level MODELLED rather than blocked out. See below.
#
# Every level is built for VERTICALITY, because RoninWorld's leap and boost only read as
# movement if there is something above you worth reaching. Each has a climb, a high walkway,
# and a drop.
#
# Authored in metres (Z-up); the exporter converts to Y-up. Bake with --scale set to the
# level's footprint so one world unit stays one metre.
#
# ⚠ …EXCEPT THAT THE FIRST THREE ARE NOT 1:1, and it is worth knowing before you copy their
#   numbers. `FOOTPRINT` is the baked world size, and bake-world.mjs scales the geometry so its
#   longest horizontal axis lands on it. ARCADE is authored 56.7 m wide and baked to 120, i.e.
#   ×2.12 — so its 1.95 m arcade cabinets come out 4.6 m tall and its 0.44 m stair risers come
#   out 0.93 m, which is ABOVE Section 9's 0.62 m step height (js/s9pc-game.js `STEP`). Measured
#   from arcade.cols.json, not inferred. LIDO is authored 1:1 on purpose (FOOTPRINT = its real
#   54 m x-extent) because it is a rebuild of an arena that already exists at player scale in
#   js/s9pc-game.js, and because every gameplay number in this repo — step 0.62, jump apex 1.37,
#   eye 1.52 — is in metres.

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import (reset, Part, solid, post, stairs, railing, arcade_cabinet, claw_machine,
                 plinth, crate, rng, spawn, export_obj)                             # noqa: E402
import kit_arch as ka                                                               # noqa: E402

# Footprints are the baked world size in metres. Deliberately large for the first three: these
# are traversal levels for an FPS now, not a duel stage, and the first pass read as cramped once
# you could actually run through them. `lido` is the exception — see the note above.
FOOTPRINT = {'arcade': 120.0, 'vault': 105.0, 'rooftop': 165.0, 'lido': 54.0}


# ══ ARCADE ══════════════════════════════════════════════════════════════════════════════════
def build_arcade(seed=3030):
    """A sunken duel floor, ringed by the machines, crossed overhead by a bridge.

    The shape is the argument: you fight in a pit while a hundred cabinets watch. The first
    pass put two rows in the middle of an empty box and it read as a warehouse — the room has
    to be organised around the fight, not merely contain it.
    """
    r = rng(seed)
    W, D, H = 56.0, 40.0, 10.0
    PX, PY, PZ = 9.5, 7.5, -2.6                                           # pit half-extents + depth

    # floor as four slabs around a hole, so the pit is real geometry with honest collision
    solid('floor_n', (0, (PY + 20.0) / 2 + 0.0, -0.25), (W, 20.0 - PY, 0.5))
    solid('floor_s', (0, -((PY + 20.0) / 2), -0.25), (W, 20.0 - PY, 0.5))
    solid('floor_e', ((PX + 28.0) / 2, 0, -0.25), (28.0 - PX, 2 * PY, 0.5))
    solid('floor_w', (-((PX + 28.0) / 2), 0, -0.25), (28.0 - PX, 2 * PY, 0.5))
    solid('pit_floor', (0, 0, PZ - 0.25), (2 * PX, 2 * PY, 0.5))
    for nm, c, s in [('pit_wall_e', (PX, 0, PZ / 2), (0.4, 2 * PY, abs(PZ))),
                     ('pit_wall_w', (-PX, 0, PZ / 2), (0.4, 2 * PY, abs(PZ)))]:
        solid(nm, c, s)
    stairs('pit_stair_n', (0, PY, 0), rise=0.52, run=0.9, width=7.0, steps=5, axis='y', sign=-1)
    stairs('pit_stair_s', (0, -PY, 0), rise=0.52, run=0.9, width=7.0, steps=5, axis='y', sign=1)

    for nm, c, s in [('wall_n', (0, D / 2, H / 2), (W, 0.7, H)),
                     ('wall_s', (0, -D / 2, H / 2), (W, 0.7, H)),
                     ('wall_e', (W / 2, 0, H / 2), (0.7, D, H)),
                     ('wall_w', (-W / 2, 0, H / 2), (0.7, D, H))]:
        solid(nm, c, s)
    for j in range(9):                                                    # wall pilasters break the blank span
        solid('pil_n%02d' % j, (-24.0 + j * 6.0, D / 2 - 0.6, H / 2), (1.1, 0.7, H))
        solid('pil_s%02d' % j, (-24.0 + j * 6.0, -D / 2 + 0.6, H / 2), (1.1, 0.7, H))

    # four banks of cabinets facing three aisles — a floor plan, not a corridor
    i = 0
    for (by, face) in ((12.0, math.pi), (15.4, 0.0), (-12.0, 0.0), (-15.4, math.pi)):
        x = -24.0
        while x <= 24.0:
            arcade_cabinet('cab%03d' % i, (x, by, 0), rz=face)
            x += 1.4
            i += 1
    for j in range(6):                                                    # cabinets facing the pit
        arcade_cabinet('cabp%02d' % j, (-PX - 1.4, -5.0 + j * 2.0, 0), rz=-math.pi / 2)
        arcade_cabinet('cabq%02d' % j, (PX + 1.4, -5.0 + j * 2.0, 0), rz=math.pi / 2)

    for j in range(9):                                                    # claw cranes, back wall
        claw_machine('claw%02d' % j, (-14.0 + j * 3.4, 18.2, 0), rz=r.uniform(-0.1, 0.1))

    # skee-ball lanes: long angled runs, the one game in here you can actually win
    for j in range(5):
        lx = -25.0
        ly = -4.0 + j * 2.6
        solid('skee%02d_lane' % j, (lx, ly, 0.45), (5.4, 1.05, 0.9))
        solid('skee%02d_hood' % j, (lx - 3.2, ly, 1.5), (1.2, 1.2, 3.0))

    # prize counter — the shelf wall of things you are working toward
    solid('prize_back', (-23.0, 13.0, 2.2), (9.0, 0.5, 4.4))
    for j in range(4):
        solid('prize_shelf%d' % j, (-23.0, 12.5, 0.9 + j * 1.05), (8.4, 0.7, 0.12))
    solid('prize_counter', (-23.0, 10.4, 0.6), (9.0, 1.4, 1.2))
    solid('prize_sign', (-23.0, 10.4, 4.9), (7.0, 0.35, 1.2))

    # change booth
    solid('booth_back', (23.0, -15.5, 1.7), (7.0, 0.45, 3.4))
    solid('booth_counter', (23.0, -13.2, 0.6), (7.0, 1.3, 1.2))
    solid('booth_sign', (23.0, -13.2, 4.1), (5.6, 0.32, 1.1))

    # TWO mezzanines and a bridge across the pit — the high line, and the reason to look up
    for side, sx in (('e', 1), ('w', -1)):
        solid('mezz_%s_deck' % side, (sx * 22.5, 0, 6.05), (9.0, 38.0, 0.6))
        railing('mezz_%s_rail' % side, (sx * 18.0, -18.0, 6.35), (sx * 18.0, 18.0, 6.35))
        for j, py in enumerate((-16.0, -8.0, 0.0, 8.0, 16.0)):
            post('mezz_%s_col%d' % (side, j), (sx * 18.6, py, 3.0), 0.5, 6.0, 10)
        for j in range(4):
            crate('mezz_%s_crate%d' % (side, j),
                  (sx * (21.0 + r.uniform(-1.2, 1.2)), -12.0 + j * 8.0, 6.35),
                  s=r.uniform(0.8, 1.15), rz=r.uniform(0, 1.5))
    stairs('mezz_stair_e', (18.0, -19.0, 0), rise=0.44, run=0.55, width=4.0, steps=14, axis='y', sign=1)
    stairs('mezz_stair_w', (-18.0, 19.0, 0), rise=0.44, run=0.55, width=4.0, steps=14, axis='y', sign=-1)
    solid('bridge', (0, 0, 6.05), (36.0, 4.2, 0.5))
    railing('bridge_railA', (-17.0, -2.1, 6.3), (17.0, -2.1, 6.3), height=1.0, post_every=3.4)
    railing('bridge_railB', (-17.0, 2.1, 6.3), (17.0, 2.1, 6.3), height=1.0, post_every=3.4)

    # roof trusses + hanging signs — depth overhead, and landmarks that read through fog
    for j in range(7):
        solid('truss%02d' % j, (-24.0 + j * 8.0, 0, H - 0.5), (0.7, D - 2.0, 0.6))
    # spawns: the pit floor is the duel, the mezzanine decks are the high entries
    # Mezzanine spawns sit at x=±24.5 and y=±16: the crates scatter at x≈±21 and y=-12+8j, and
    # the deck's usable strip is what is left outboard of them.
    for j, (sx, sy, sz) in enumerate(((-6.0, -4.0, PZ), (6.0, 4.0, PZ), (0.0, -5.5, PZ),
                                      (0.0, 5.5, PZ), (-24.5, -16.5, 6.35), (24.5, 16.5, 6.35))):
        spawn('a%d' % j, (sx, sy, sz))

    for j in range(5):
        solid('sign%02d' % j, (-16.0 + j * 8.0, 9.6, 7.8), (3.6, 0.35, 1.4))
        post('sign%02d_rodA' % j, (-17.2 + j * 8.0, 9.6, 8.9), 0.06, 1.8, 6)
        post('sign%02d_rodB' % j, (-14.8 + j * 8.0, 9.6, 8.9), 0.06, 1.8, 6)


# ══ VAULT ═══════════════════════════════════════════════════════════════════════════════════
def build_vault(seed=3030):
    r = rng(seed)
    R, H, SEG = 23.0, 11.0, 16
    Part('floor').cyl((0, 0, -0.3), R + 1.0, 0.6, 32).emit()

    # a ring of wall segments, each with a recessed bay between pilasters. The first pass left
    # a blank 11 m wall all the way round and the room read as a tank; the bays give it a beat.
    for i in range(SEG):
        a = math.tau * i / SEG
        seg_w = 2.0 * (R + 0.5) * math.tan(math.pi / SEG) + 0.35
        solid('wall%02d' % i, ((R + 0.5) * math.cos(a), (R + 0.5) * math.sin(a), H / 2),
              (0.7, seg_w, H), a)
        ap = math.tau * (i + 0.5) / SEG                                   # pilaster on the seam
        solid('pilaster%02d' % i, ((R - 0.2) * math.cos(ap), (R - 0.2) * math.sin(ap), H / 2),
              (1.5, 1.2, H), ap)
        solid('lintel%02d' % i, ((R - 0.1) * math.cos(a), (R - 0.1) * math.sin(a), 8.4),
              (1.0, seg_w * 0.72, 0.7), a)                                # bay head
        solid('sill%02d' % i, ((R - 0.1) * math.cos(a), (R - 0.1) * math.sin(a), 0.55),
              (1.2, seg_w * 0.72, 1.1), a)                                # bay sill / bench
    # Cornice as a RING of segments. It was briefly a kit.cyl() — which always emits end caps,
    # so it roofed the hall over as one solid drum and the whole level rendered as a closed
    # tin. For anything annular, ring the segments; cyl() is for solids.
    for i in range(SEG):
        a = math.tau * i / SEG
        seg_w = 2.0 * (R + 0.9) * math.tan(math.pi / SEG) + 0.4
        solid('cornice%02d' % i, ((R + 0.9) * math.cos(a), (R + 0.9) * math.sin(a), H + 0.35),
              (2.2, seg_w, 0.7), a)

    # plinths in a grid, clipped to the circle and skipping the middle so the floor stays a room
    k = 0
    for gx in range(-3, 4):
        for gy in range(-3, 4):
            px, py = gx * 4.6, gy * 4.6
            d = math.hypot(px, py)
            if d > 15.5 or d < 4.0:
                continue
            plinth('plinth%02d' % k, (px, py, 0), rz=r.uniform(-0.25, 0.25))
            k += 1
    # inlaid floor rings — the room reads as designed rather than as a disc
    for i, rr in enumerate((5.2, 10.4, 15.6)):
        for j in range(24):
            a = math.tau * j / 24
            solid('inlay%d_%02d' % (i, j), (rr * math.cos(a), rr * math.sin(a), 0.03),
                  (0.9, 2.0 * rr * math.tan(math.pi / 24) * 0.9, 0.06), a)

    # rostrum: the auctioneer's high ground, three steps up
    solid('dais', (0, -17.0, 0.45), (11.0, 5.0, 0.9))
    stairs('dais_stair', (0, -14.2, 0), rise=0.3, run=0.5, width=6.0, steps=3, axis='y', sign=-1)
    solid('rostrum', (0, -17.6, 1.6), (2.2, 1.3, 1.4))
    solid('rostrum_top', (0, -17.6, 2.4), (2.8, 1.7, 0.18))

    # THE VAULT DOOR — the landmark. You orient by it from anywhere in the room, so it is
    # oversized on purpose and set in its own projecting bay.
    solid('door_bay', (0, R + 1.4, 6.2), (16.0, 3.4, 12.4))
    solid('door_step', (0, R - 3.6, 0.35), (13.0, 4.0, 0.7))
    door = Part('vault_door')
    door.cyl((0, R - 1.0, 6.2), 5.8, 1.4, 32)
    door.cyl((0, R - 2.0, 6.2), 4.4, 0.7, 28)
    door.cyl((0, R - 2.4, 6.2), 1.5, 1.4, 16)
    for i in range(8):                                                    # spokes
        a = math.tau * i / 8
        door.box((math.cos(a) * 3.2, R - 2.3, 6.2 + math.sin(a) * 3.2), (4.4, 0.9, 0.4), 0)
    door.emit()
    for sx in (-1, 1):                                                    # hinge stack
        post('door_hinge%d' % (sx > 0), (sx * 6.4, R - 1.2, 6.2), 0.75, 11.0, 10)

    # BALCONY: a walkway ring on columns, with one staircase up. The room read from above is
    # a different room — that is what the height is for.
    for i in range(SEG):
        a = math.tau * i / SEG
        seg_w = 2.0 * (R - 3.0) * math.tan(math.pi / SEG) + 0.3
        solid('balc%02d' % i, ((R - 3.4) * math.cos(a), (R - 3.4) * math.sin(a), 6.8),
              (7.0, seg_w, 0.5), a)
        post('col%02d' % i, ((R - 3.4) * math.cos(a), (R - 3.4) * math.sin(a), 3.3), 0.42, 6.6, 10)
    for i in range(SEG):
        a0, a1 = math.tau * i / SEG, math.tau * (i + 1) / SEG
        r_in = R - 6.6
        railing('balc_rail%02d' % i, (r_in * math.cos(a0), r_in * math.sin(a0), 7.05),
                (r_in * math.cos(a1), r_in * math.sin(a1), 7.05), height=1.0, post_every=3.0)
    stairs('balc_stair', (16.5, 8.0, 0), rise=0.44, run=0.52, width=3.4, steps=16, axis='y', sign=1)

    # spawns: the clear annulus between the plinth field and the wall, plus two on the balcony
    # ⚠ bake-world emits AXIS-ALIGNED collision boxes, so each rotated wall segment's AABB
    # reaches well inside the wall it represents (a 9 m segment at 45 deg swells ~3.5 m inward).
    # The clear standing band is therefore much tighter than the geometry suggests: outside the
    # plinth field (~16.1 m) but inside the wall AABBs (~20 m). 17.6 threads it.
    # Angles skip the door bay (+90 deg) and the dais (-90 deg), which project into the room.
    for j, a in enumerate((0.30, 0.95, 2.50, 3.05, 3.75, 5.95)):
        spawn('v%d' % j, (17.6 * math.cos(a), 17.6 * math.sin(a), 0.0))
    # The balcony's standing band is narrower than its 4.6 m deck: the railing's rotated AABBs
    # swell inward to ~18.9 and the wall's swell inward to ~20. 19.4 is the middle of what's left.
    for j, a in enumerate((1.20, 4.34)):
        spawn('vb%d' % j, (19.4 * math.cos(a), 19.4 * math.sin(a), 7.05))

    # velvet-rope stanchions around the plinth field
    for i in range(14):
        a = math.tau * i / 14
        post('rope%02d' % i, (17.5 * math.cos(a), 17.5 * math.sin(a), 0.55), 0.11, 1.1, 6)


# ══ ROOFTOP ═════════════════════════════════════════════════════════════════════════════════
def build_rooftop(seed=3030):
    r = rng(seed)
    solid('roof_main', (0, 0, -0.3), (34.0, 30.0, 0.6))
    for nm, c, s in [('para_n', (0, 15.2, 0.75), (34.0, 0.6, 1.5)),
                     ('para_s', (0, -15.2, 0.75), (34.0, 0.6, 1.5)),
                     ('para_e', (17.2, 0, 0.75), (0.6, 30.0, 1.5)),
                     ('para_w', (-17.2, 0, 0.75), (0.6, 30.0, 1.5))]:
        solid(nm, c, s)

    # plant: AC units, ducts, dishes and vents, seeded so the roof is cluttered but reproducible
    placed = []
    for i in range(16):
        for _ in range(24):                                               # rejection-sample, don't overlap
            cx, cy = r.uniform(-14.5, 14.5), r.uniform(-12.5, 12.5)
            if abs(cx) < 5.5 and abs(cy) < 5.5:
                continue                                                  # keep the duel floor clear
            if all(math.hypot(cx - px, cy - py) > 3.4 for px, py in placed):
                placed.append((cx, cy))
                break
        else:
            continue
        w, d, h = r.uniform(1.7, 3.2), r.uniform(1.5, 2.6), r.uniform(0.9, 2.0)
        rz = r.uniform(0, 1.5)
        solid('ac%02d' % i, (cx, cy, h / 2), (w, d, h), rz)
        post('ac%02d_fan' % i, (cx, cy, h + 0.14), min(w, d) * 0.32, 0.28, 10)
        if i % 3 == 0:                                                    # duct running off to the parapet
            solid('duct%02d' % i, (cx, cy + 2.6, h * 0.7), (0.8, 4.0, 0.8), rz)
    for i in range(6):
        post('vent%02d' % i, (r.uniform(-15, 15), r.uniform(-13, 13), 0.65), 0.36, 1.3, 8)
    for i in range(3):                                                    # satellite dishes on stands
        dx, dy = r.uniform(-14, 14), r.uniform(-12, 12)
        post('dish%d_mast' % i, (dx, dy, 0.9), 0.13, 1.8, 6)
        Part('dish%d' % i).cyl((dx, dy, 2.0), 1.15, 0.34, 14, r2=0.35).emit()
    for i in range(6):                                                    # crates + a pallet stack to fight over
        crate('rcrate%d' % i, (r.uniform(-15, 15), r.uniform(-13, 13), 0), s=r.uniform(0.85, 1.2),
              rz=r.uniform(0, 1.5))
    solid('pallets', (-14.0, -6.0, 0.55), (3.2, 2.6, 1.1))
    solid('pallets2', (-14.0, -6.0, 1.5), (2.6, 2.2, 0.8))

    # ROOFTOP SIGN — the biggest silhouette on the level; slats read as letters at distance
    for j in range(9):
        solid('rsign_slat%02d' % j, (-13.0 + j * 3.2, -14.6, 5.6), (1.5, 0.35, 4.4))
    solid('rsign_rail', (0, -14.6, 3.1), (28.0, 0.5, 0.5))
    for sx in (-1, 1):
        post('rsign_leg%d' % (sx > 0), (sx * 12.5, -14.6, 1.6), 0.25, 3.2, 8)

    # stair bulkhead — the way "in", and a mid-height platform to fight on
    solid('bulkhead', (-11.0, 9.0, 1.9), (5.0, 4.4, 3.8))
    solid('bulk_roof', (-11.0, 9.0, 3.95), (5.6, 5.0, 0.3))
    stairs('bulk_stair', (-8.2, 9.0, 0), rise=0.4, run=0.5, width=2.6, steps=10, axis='x', sign=1)

    # WATER TOWER — the silhouette that makes this a rooftop and not a floor
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        post('tower_leg%d' % i, (10.5 + sx * 1.7, -8.0 + sy * 1.7, 2.6), 0.16, 5.2, 6)
    Part('tower_tank').cyl((10.5, -8.0, 6.9), 2.6, 3.4, 16).emit()
    Part('tower_cap').cyl((10.5, -8.0, 8.9), 2.7, 0.6, 16, r2=0.5).emit()
    solid('tower_deck', (10.5, -8.0, 5.15), (6.4, 6.4, 0.3))

    # BILLBOARD — reads from the far side of the roof, and its walkway is a sniper's perch
    for sx in (-1, 1):
        post('bill_post%d' % (sx > 0), (sx * 4.6, 14.0, 3.4), 0.28, 6.8, 8)
    solid('bill_panel', (0, 14.2, 8.4), (12.0, 0.4, 4.4))
    # Widened to 2.6 m with the rail pushed out to y=12.0: at 1.4 m between a railing and the
    # sign panel there was no gap a 1.1 m-wide player could stand in, so the perch was fiction.
    solid('bill_walk', (0, 12.9, 6.0), (12.0, 2.6, 0.25))
    railing('bill_rail', (-5.8, 11.8, 6.15), (5.8, 11.8, 6.15), height=0.95)

    # CATWALK to a lower neighbouring roof — the drop that makes the leap worth taking
    solid('annex', (26.0, 6.0, -2.0), (14.0, 16.0, 4.0))
    solid('annex_para', (26.0, 13.6, 0.5), (14.0, 0.5, 1.0))
    solid('catwalk', (21.5, 4.0, 0.05), (9.0, 2.2, 0.25))
    railing('catwalk_railA', (17.2, 3.0, 0.2), (26.0, 3.0, 0.2), height=0.95, post_every=2.6)
    railing('catwalk_railB', (17.2, 5.0, 0.2), (26.0, 5.0, 0.2), height=0.95, post_every=2.6)

    # SKYLINE you can actually land on, rather than a painted backdrop
    towers = [(-34, -20, 9, 11, 15), (-30, 14, 11, 13, 22), (34, -20, 13, 12, 18),
              (-6, 32, 15, 10, 26), (16, 34, 12, 12, 19), (36, 24, 10, 14, 13),
              (0, -34, 18, 11, 24), (-38, 2, 10, 16, 16)]
    for i, (tx, ty, tw, td, th) in enumerate(towers):
        solid('sky%02d' % i, (tx, ty, th / 2 - 6.0), (tw, td, th))
        solid('sky%02d_cap' % i, (tx, ty, th - 6.0), (tw * 0.55, td * 0.55, 1.6))
        post('sky%02d_mast' % i, (tx, ty, th - 4.4), 0.14, 3.0, 6)
    # spawns: the deliberately-clear centre, plus every high perch worth opening from
    # The billboard walkway spawn clears its own railing (y=12.6), and there is deliberately no
    # spawn on the water-tower deck: the tank is r=2.6 on a 6.4 deck, leaving a 0.6 m ring that
    # is narrower than the player. A perch you cannot stand on is not a perch.
    for j, (sx, sy, sz) in enumerate(((-4.0, -3.0, 0.0), (4.0, 3.0, 0.0), (0.0, -4.5, 0.0),
                                      (26.0, 6.0, 0.0), (-11.0, 9.0, 4.1), (0.0, 12.9, 6.15),
                                      (-15.8, 12.8, 0.0))):
        spawn('r%d' % j, (sx, sy, sz))

    for i in range(3):                                                    # antennae on our own roof
        post('mast%d' % i, (-15.0 + i * 1.6, -13.0, 3.0), 0.1, 6.0, 6)


# ══ LIDO ════════════════════════════════════════════════════════════════════════════════════
def build_lido(seed=3030):
    """LIDO DECK, MODELLED — the same arena as `js/s9pc-game.js`'s LIDO DECK, in real geometry.

    ⚑ WHY THIS LEVEL EXISTS. The artist's note was exact: "this doesn't look like the other game,
    still looks the same… in terms of arena / level design, character design, we have blender,
    shader tools, so much to create with." Every solid in every arena we ship — the six
    hand-built ones AND the three baked ones — is an axis-aligned box. `addBox` is literally the
    only shape `buildMaps()` can make, and `kit.py` is a box kit with a cylinder in it. Materials
    were already re-derived twice (the daylight albedo pass, the PBR pass) and neither could fix
    it, because the problem is not what the surfaces are made of, it is that there are only six
    of them per object and they all meet at 90°. Light needs a facet to sit on.

    So this is the SAME arena — same 52 x 44 m footprint, same pool, same colonnade, terraces,
    cabanas, planters, diving tower, corner towers, pavilions, same spawn coordinates — rebuilt
    out of `kit_arch.py`: radiused coping swept from a bullnose profile, round columns with
    entasis carrying real semicircular arches, balustrades with individual turned balusters,
    nosed treads, tapered parasol poles under segmented canopies, planting with a silhouette, and
    a chamfer on every large mass.

    ⚑ IT IS A REBUILD, NOT A REDESIGN. Cover placement, sightline breaks and the exposed pool
    crossing are the tuned part of the hand-built arena and they are preserved deliberately:
      · the pool is still WADEABLE — its surface sits 0.30 m below the deck, under Section 9's
        0.62 m step height, so it is still the exposed crossing the original comment argues for
        rather than a pit. It now has a basin, a radiused lip and entry steps, which is what
        makes it read as a pool instead of a teal rectangle.
        ⚠ The lip height is a VISIBILITY number, not a modelling one. At the first draft's
        +0.30 m lip with the water 0.42 m down, a camera 9 m back could not see the near third
        of the water at all — the lip occludes everything below the sightline that grazes it,
        and the hand-built arena's whole colour argument rests on the pool being the most
        saturated field in frame. +0.18 with the water at −0.30 keeps the bright line round the
        pool and roughly halves what it hides.
      · the arcade is still WALKABLE: every arch springs at 3.9 m, well above the ~2.7 m at
        which `blocksE` would turn one Part's AABB into a wall across the bay.
      · loungers are 0.58 m tall in one piece, i.e. under the step height, so the new clutter
        breaks sightlines without stopping anybody.

    Authored in GAME coordinates via kit_arch — (x, z, y) with y up, the order `MAP.spawns` uses
    — with the deck top as y = 0. `bake-world.mjs` drops the floor of the level to y = 0, so
    everything lands 1.0 m higher in game than it is written here (BASE is -1.0). Heights below
    are therefore DECK-RELATIVE and directly comparable with the hand-built map's numbers.
    """
    r = rng(seed)
    HX, HZ = 26.0, 22.0                  # play half-extents — the hand-built arena's, unchanged
    WT = 1.0                             # perimeter thickness → outer envelope 54 x 46 m
    BASE = -1.0                          # underside of every mass; sets where game y = 0 lands
    PX, PZ, PR = 9.5, 7.5, 2.2           # pool half-extents + corner radius
    WATER = -0.30                        # water surface, deck-relative (< the 0.62 step height)
    COPE = 0.95                          # coping width, outboard of the pool edge

    # ── deck: four slabs around the pool hole, so the basin is real geometry ────────────────
    # (the same move build_arcade() makes for its pit — a hole you can see into needs to BE a
    #  hole, not a darker rectangle painted on a floor)
    CX0, CZ0 = PX + COPE, PZ + COPE
    for nm, x0, z0, x1, z1 in (('deck_n', -HX, CZ0, HX, HZ), ('deck_s', -HX, -HZ, HX, -CZ0),
                               ('deck_e', CX0, -CZ0, HX, CZ0), ('deck_w', -HX, -CZ0, -CX0, CZ0)):
        p = ka.GPart(nm)
        ka.gbox(p, ((x0 + x1) / 2, (z0 + z1) / 2, BASE / 2), (x1 - x0, z1 - z0, -BASE))
        p.emit()

    # paving bands — a 6 cm inlay, so the deck has a grid the eye can lock onto at range. Too
    # low to read as an obstacle to the collider (`checkSpawns` only counts boxes above step
    # height) and cheap: eight strips, twelve triangles each.
    for i, (x0, z0, x1, z1) in enumerate(((-HX + 1.4, -HZ + 1.4, HX - 1.4, -HZ + 2.2),
                                          (-HX + 1.4, HZ - 2.2, HX - 1.4, HZ - 1.4),
                                          (-HX + 1.4, -HZ + 2.2, -HX + 2.2, HZ - 2.2),
                                          (HX - 2.2, -HZ + 2.2, HX - 1.4, HZ - 2.2),
                                          (-16.4, -CZ0 - 1.0, -CX0 - 1.0, -CZ0 - 0.3),
                                          (CX0 + 1.0, CZ0 + 0.3, 16.4, CZ0 + 1.0),
                                          (-16.4, CZ0 + 0.3, -CX0 - 1.0, CZ0 + 1.0),
                                          (CX0 + 1.0, -CZ0 - 1.0, 16.4, -CZ0 - 0.3))):
        p = ka.GPart('trm_inlay%02d' % i)
        ka.gbox(p, ((x0 + x1) / 2, (z0 + z1) / 2, 0.03), (x1 - x0, z1 - z0, 0.06), ch=0.02)
        p.emit()

    # ── the pool ────────────────────────────────────────────────────────────────────────────
    pool_plan = ka.round_rect_plan(-PX, -PZ, PX, PZ, PR, corner_seg=5)
    p = ka.GPart('water_pool')
    ka.prism(p, [(pool_plan, BASE), (pool_plan, WATER)], label='water')
    p.emit()

    # coping: a bullnose section swept round the pool edge.
    # ⚠ EMITTED IN EIGHT CHUNKS, and that is a collision decision. One Part is one AABB, so a
    #   single swept ring would put a solid box with its top at +0.28 over the ENTIRE pool —
    #   the player would walk across the water on an invisible lid. Chunks keep each AABB on
    #   its own arc.
    # ⚠ profile wound COUNTER-CLOCKWISE in its own (out, up) plane — bottom outward, up the outer
    #   face, back along the top, down the bullnose. Written the other way round (which is how it
    #   reads more naturally, inner face first) every chunk comes out inside-out; kit_arch's
    #   volume check caught all eight and this is the fix rather than leaning on the auto-flip.
    prof = [(0.00, BASE), (COPE, BASE), (COPE, -0.12), (COPE + 0.10, -0.06),
            (COPE + 0.10, 0.06), (COPE, 0.10), (COPE, 0.18), (0.32, 0.18),
            (0.16, 0.16), (0.05, 0.11), (0.00, 0.02)]
    ka.sweep_chunks('trm_coping%02d', ka.path_from_plan(pool_plan), prof, 8)

    # entry steps, two flights, into the shallow end of each long side
    for k, (sx, sz) in enumerate(((-5.4, -1), (5.4, 1))):
        z_edge = sz * PZ
        for i in range(3):
            top = WATER + (0.30 - i * 0.15)
            zi0 = z_edge - sz * (0.55 * (i + 1))
            zi1 = z_edge - sz * (0.55 * i)
            ka.nosed_tread('pool%d_step%02d' % (k, i), sx - 2.1, min(zi0, zi1), sx + 2.1,
                           max(zi0, zi1), top, top - BASE, '+z' if sz < 0 else '-z')

    # ── DIVING TOWER — the landmark that keeps the pool from being a flat teal field ─────────
    # (the hand-built arena's comment measured what a frame with nothing in it costs: rms 11.7
    #  from a spawn, against 39-49 from a spot with structure in front of the camera. Same job
    #  here, now with a ladder, a nosed platform edge and a real handrail rather than a stack.)
    p = ka.GPart('dive_base')
    ka.prism(p, [(ka.octa_plan(-1.95, -1.95, 1.95, 1.95, 0.5), BASE),
                 (ka.octa_plan(-1.9, -1.9, 1.9, 1.9, 0.5), 0.12),
                 (ka.octa_plan(-1.62, -1.62, 1.62, 1.62, 0.45), 0.22),
                 (ka.octa_plan(-1.2, -1.2, 1.2, 1.2, 0.34), 6.4)], label='dive_shaft')
    p.emit()
    p = ka.GPart('trm_dive_deck')
    ka.gbox(p, (0, 0, 6.62), (6.6, 6.6, 0.44), ch=0.22, top_ch=0.07)
    ka.extrude_x(p, [(-3.4, 6.62), (3.4, 6.62), (3.4, 6.78), (-3.4, 6.78)], -3.5, 3.5, label='nosing')
    p.emit()
    for sz in (-1, 1):
        ka.balustrade('trm_dive_rail%d' % (sz > 0), -3.0, sz * 3.1, 3.0, sz * 3.1, 6.84,
                      height=1.02, spacing=0.78, thick=0.22)
    p = ka.GPart('dive_ladder')                                          # rungs, not a grey slab
    for sx in (-1, 1):
        ka.gbox(p, (sx * 0.32, -2.05, 3.3), (0.10, 0.10, 6.3), ch=0.02)
    for i in range(14):
        y = 0.45 + i * 0.42
        ka.extrude_x(p, [(-2.09, y), (-2.01, y), (-2.01, y + 0.07), (-2.09, y + 0.07)],
                     -0.33, 0.33, label='rung')
    p.emit()
    p = ka.GPart('trm_dive_board')                                        # springboard, over the water
    ka.prism(p, [(ka.rect_plan(3.2, -0.55, 3.4, 0.55), 6.84),
                 (ka.rect_plan(3.2, -0.55, 3.4, 0.55), 6.92)], label='fulcrum')
    ka.prism(p, [(ka.rect_plan(2.6, -0.42, 6.4, 0.42), 6.9),
                 (ka.rect_plan(2.6, -0.40, 6.5, 0.40), 6.98)], label='board')
    p.emit()

    # ── SUN TERRACES (+x / -x), stepped, with nosed treads and a real balustrade ─────────────
    for side, sx, ttop, steps in (('w', -1, 2.40, 4), ('e', 1, 3.40, 5)):
        x_in, x_out = sx * 17.6, sx * 25.6
        p = ka.GPart('terr_%s_deck' % side)
        ka.gbox(p, ((x_in + x_out) / 2, 0, (BASE + ttop) / 2), (abs(x_out - x_in), 26.0, ttop - BASE),
                ch=0.16, top_ch=0.05)
        p.emit()
        # the flight: projects into the deck, so its head is flush with the terrace it serves
        run = 0.86 * steps
        ka.flight('terr_%s_stair' % side, x_in - sx * run, -3.0, x_in, 3.0, 0.0, ttop, steps,
                  '-x' if sx > 0 else '+x', run_axis='x', y_base=BASE)
        # balustrade in two runs, leaving the stair head open
        for k, (z0, z1) in enumerate(((-13.0, -3.4), (3.4, 13.0))):
            ka.balustrade('trm_terr_%s_rail%d' % (side, k), x_in - sx * 0.16, z0,
                          x_in - sx * 0.16, z1, ttop, height=1.10, spacing=0.86, thick=0.30)

    # ── COLONNADE (-z) — round columns carrying semicircular arches ──────────────────────────
    COL_Z, COL_Y = -19.2, 3.90
    for i in range(7):
        ka.column('trm_col%02d' % i, -18.0 + i * 6.0, COL_Z, 0.0, COL_Y, r=0.42, seg=10)
    for i in range(6):
        a0, a1 = -18.0 + i * 6.0, -12.0 + i * 6.0
        p = ka.GPart('trm_arch%02d' % i)
        ka.arch(p, a0 + 0.5, a1 - 0.5, COL_Z, 0.86, COL_Y, 0.44, seg=9)
        p.emit()
    p = ka.GPart('trm_entab')                       # entablature: architrave, frieze, cornice
    ka.extrude_x(p, [(-19.85, 6.42), (-18.55, 6.42), (-18.55, 6.72), (-18.45, 6.78),
                     (-18.45, 7.02), (-18.30, 7.10), (-18.30, 7.30), (-19.95, 7.30),
                     (-19.95, 7.10), (-19.85, 7.02)], -19.0, 19.0, label='entab')
    p.emit()
    p = ka.GPart('col_roof')                        # lean-to over the arcade, back to the wall
    ka.extrude_x(p, [(-22.0, 7.62), (-18.2, 7.16), (-18.2, 7.40), (-22.0, 7.86)],
                 -19.0, 19.0, label='pent')
    p.emit()

    # ── PERIMETER: chamfered walls, a moulded coping course, pilasters on the open runs ──────
    # ⚠ THE COPING OVERSAILS INWARD ONLY, AND THAT IS ABOUT THE BAKE, NOT ABOUT THE MOULDING.
    #   bake-world scales the level so its LONGEST HORIZONTAL AXIS lands on FOOTPRINT. The first
    #   version let each coping oversail 0.14 m past the perimeter on both sides, so the true
    #   x-extent was 54.28 against a declared 54 and the whole arena came out ×0.9948 — a 52 m
    #   pool deck rebuilt at 51.7 m, spawns at ±12.93 where ±13 was authored. Small, silent, and
    #   exactly the kind of drift that makes an A/B against the hand-built arena meaningless.
    #   Keeping the outer face flush with the envelope makes the scale exactly 1.0.
    for nm, x0, z0, x1, z1, h, inward in (('wall_n', -HX - WT, HZ, HX + WT, HZ + WT, 5.4, '-z'),
                                          ('wall_s', -HX - WT, -HZ - WT, HX + WT, -HZ, 7.9, '+z'),
                                          ('wall_w', -HX - WT, -HZ, -HX, HZ, 6.0, '+x'),
                                          ('wall_e', HX, -HZ, HX + WT, HZ, 6.0, '-x')):
        p = ka.GPart(nm)
        ka.gbox(p, ((x0 + x1) / 2, (z0 + z1) / 2, (BASE + h) / 2), (x1 - x0, z1 - z0, h - BASE),
                ch=0.12, top_ch=0.05)
        p.emit()
        q = ka.GPart('trm_' + nm + '_cope')
        OS = 0.18
        if inward in ('-z', '+z'):
            a, b = (z0 - OS, z1) if inward == '-z' else (z0, z1 + OS)
            ka.extrude_x(q, [(a, h), (b, h), (b, h + 0.17), (b - 0.06, h + 0.29),
                             (a + 0.06, h + 0.29), (a, h + 0.17)], x0, x1, label='cope')
        else:
            a, b = (x0, x1 + OS) if inward == '+x' else (x0 - OS, x1)
            ka.extrude_z(q, [(a, h), (b, h), (b, h + 0.17), (b - 0.06, h + 0.29),
                             (a + 0.06, h + 0.29), (a, h + 0.17)], z0, z1, label='cope')
        q.emit()
    # ⚠ named `wall_…`, NOT `pilaster…`: section9-world's kindOf sends /pil/ to `pillar`, which
    #   s9pc-world maps to the cool-steel `metal` class — five blue-grey panels down the sunniest
    #   wall in the arena. A masonry pilaster is masonry.
    for i in range(5):                                          # +z wall, the run you can see
        p = ka.GPart('wall_n_bay%02d' % i)
        ka.gbox(p, (-8.0 + i * 4.0, HZ - 0.2, (BASE + 5.4) / 2), (0.95, 0.55, 5.4 - BASE), ch=0.06)
        p.emit()

    # ── PAVILIONS (+z) — a solid block behind an arcaded loggia ──────────────────────────────
    for side, x0, x1, hgt in (('w', -22.0, -10.0, 9.0), ('e', 10.0, 22.0, 7.5)):
        p = ka.GPart('pav_%s_body' % side)
        ka.gbox(p, ((x0 + x1) / 2, 19.9, (BASE + hgt) / 2), (x1 - x0, 3.4, hgt - BASE),
                ch=0.20, top_ch=0.06)
        p.emit()
        q = ka.GPart('trm_pav_%s_cornice' % side)
        ka.extrude_x(q, [(18.1, hgt), (21.8, hgt), (21.8, hgt + 0.26), (21.6, hgt + 0.40),
                         (18.3, hgt + 0.40), (18.1, hgt + 0.26)], x0 - 0.4, x1 + 0.4, label='cornice')
        q.emit()
        p = ka.GPart('pav_%s_roof' % side)                       # hipped, with eaves overhanging
        ka.prism(p, [(ka.rect_plan(x0 - 0.5, 17.9, x1 + 0.5, 22.0), hgt + 0.40),
                     (ka.rect_plan(x0 + 2.4, 19.2, x1 - 2.4, 20.7), hgt + 1.55)],
                 label='hip')
        p.emit()
        piers = [x0 + 0.7 + k * ((x1 - x0 - 1.4) / 3.0) for k in range(4)]
        for k, px in enumerate(piers):
            q = ka.GPart('trm_pav_%s_pier%d' % (side, k))
            ka.gbox(q, (px, 17.2, (BASE + 3.6) / 2), (0.86, 1.0, 3.6 - BASE), ch=0.08)
            ka.gbox(q, (px, 17.2, 3.72), (1.10, 1.24, 0.24), ch=0.05)
            q.emit()
        for k in range(3):
            q = ka.GPart('trm_pav_%s_arch%d' % (side, k))
            ka.arch(q, piers[k] + 0.43, piers[k + 1] - 0.43, 17.2, 0.9, 3.86, 0.36, seg=8)
            q.emit()
        q = ka.GPart('trm_pav_%s_lintel' % side)
        ka.extrude_x(q, [(16.55, 6.05), (17.85, 6.05), (17.85, 6.42), (16.70, 6.42),
                         (16.55, 6.30)], x0 + 0.1, x1 - 0.1, label='lintel')
        q.emit()

    # ── CORNER TOWERS (-z corners) — the tall silhouette, with a belvedere on top ────────────
    for side, x0, x1, hgt in (('w', -24.8, -19.2, 11.5), ('e', 19.2, 24.8, 9.5)):
        z0, z1 = -20.6, -15.0
        p = ka.GPart('twr_%s' % side)
        ka.prism(p, [(ka.octa_plan(x0, z0, x1, z1, 0.55), BASE),
                     (ka.octa_plan(x0, z0, x1, z1, 0.55), hgt * 0.45),
                     (ka.octa_plan(x0 + 0.22, z0 + 0.22, x1 - 0.22, z1 - 0.22, 0.55), hgt)],
                 label='tower')
        p.emit()
        for k, band in enumerate((hgt * 0.45, hgt)):             # string course / cap moulding
            q = ka.GPart('trm_twr_%s_band%d' % (side, k))
            ka.prism(q, [(ka.octa_plan(x0 - 0.18, z0 - 0.18, x1 + 0.18, z1 + 0.18, 0.6), band - 0.10),
                         (ka.octa_plan(x0 - 0.24, z0 - 0.24, x1 + 0.24, z1 + 0.24, 0.6), band + 0.06),
                         (ka.octa_plan(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, 0.6), band + 0.26)],
                     label='band')
            q.emit()
        for k, (sx, sz) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
            q = ka.GPart('trm_twr_%s_pier%d' % (side, k))
            ka.lathe(q, (x0 + x1) / 2 + sx * 1.95, (z0 + z1) / 2 + sz * 1.95,
                     [(hgt + 0.26, 0.30), (hgt + 0.40, 0.24), (hgt + 2.10, 0.22),
                      (hgt + 2.30, 0.28)], seg=8, label='belv_pier')
            q.emit()
        # ⚑ THE `_cap` SUFFIX IS LOAD-BEARING and it was found by looking, not by design.
        #   section9-world's kindOf sends /cap\b/ to `cover`, which s9pc-world maps to the
        #   cool-steel `metal` class — so the belvedere roofs come out lead-blue. In a frame that
        #   is otherwise cream plaster, sand and terracotta they are the only cool accent and the
        #   only thing that reads as a roof rather than as more masonry, so the name stays.
        #   Rename it and you get two more cream boxes on the skyline.
        q = ka.GPart('twr_%s_cap' % side)                        # pyramid + finial
        ka.prism(q, [(ka.octa_plan(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, 0.7), hgt + 2.30),
                     (ka.octa_plan(x0 + 0.1, z0 + 0.1, x1 - 0.1, z1 - 0.1, 0.7), hgt + 2.62),
                     (ka.circle_plan((x0 + x1) / 2, (z0 + z1) / 2, 0.30, 8), hgt + 4.30)],
                 label='cap')
        ka.lathe(q, (x0 + x1) / 2, (z0 + z1) / 2,
                 [(hgt + 4.30, 0.16), (hgt + 4.55, 0.24), (hgt + 5.00, 0.06)], seg=6, label='finial')
        q.emit()

    # ── CABANAS — mid-field cover you can find at any range ──────────────────────────────────
    for i, (cx, cz) in enumerate(((-11.5, 13.5), (0.0, 15.5), (11.5, 13.5),
                                  (-6.0, -12.5), (6.0, -12.5))):
        ka.cabana('hut%02d' % i, 'awn_hut%02d_top' % i, cx, cz, 0.0,
                  ry=r.uniform(-0.05, 0.05))

    # ── PLANTERS — low green cover with an actual silhouette ─────────────────────────────────
    for i, (px, pz, py) in enumerate(((-13.5, 4.5, 0.0), (13.5, -4.5, 0.0), (-13.5, -4.5, 0.0),
                                      (13.5, 4.5, 0.0), (0.0, 11.0, 0.0), (0.0, -10.5, 0.0),
                                      (-21.5, -11.0, 2.40), (21.5, 11.0, 3.40))):
        # terracotta, not white stone: `crate_` lands on section9-world's existing crate rule,
        # which is the one warm albedo in MATS_DAY and the thing that stops a lido full of white
        # trim reading as one flat cream field
        ka.planter('crate_plntr%02d' % i, px, pz, py, r=1.35, seg=8, h=0.78)
        ka.foliage('plnt_folig%02d' % i, px, pz, py + 0.72, r=1.20, rnd=r, clumps=4)

    # ── PARASOLS — tapered poles, segmented canopies, frame-breakers at head height ──────────
    for i, (ux, uz, uy) in enumerate(((-14.6, 0.0, 0.0), (14.6, 0.0, 0.0), (0.0, -13.5, 0.0),
                                      (-21.5, -7.5, 2.40), (-21.5, 7.5, 2.40), (21.5, 0.0, 3.40))):
        ka.parasol('trm_umb%02d' % i, 'awn_umb%02d_top' % i, ux, uz, uy)

    # ── LOUNGERS — deck clutter that is under the step height, so it never stops anybody ─────
    lng = []
    for z in (-8.4, -3.0, 3.0, 8.4):
        lng.append((-22.6, z, 2.40, 0.0))
        lng.append((22.6, z, 3.40, math.pi))
    # ⚠ pool-side pairs sit CLEAR of the four inner spawns. The first placement put them at
    #   (±13.4, ±9.6), i.e. half a metre from the spawns at (±13, ±10) — `dropAt` seeds y from
    #   supportY, so every one of those four spawns started the player standing on a sunbed
    #   (support 1.50 against a 1.00 deck). Legal, since a lounger is under the step height, and
    #   still wrong.
    for (lx, lz) in ((-16.6, -6.2), (16.6, 6.2), (-16.6, 6.2), (16.6, -6.2)):
        lng.append((lx, lz, 0.0, math.atan2(-lz, -lx)))
    for i, (lx, lz, ly, lr) in enumerate(lng):
        ka.lounger('trm_lng%02d' % i, lx, lz, ly, ry=lr)

    # ── LIFEGUARD STAND — the one high perch, small and exposed on three sides ───────────────
    p = ka.GPart('guard_stand')
    for sx in (-1, 1):
        for sz in (-1, 1):
            ka.lathe(p, sx * 1.15, 20.2 + sz * 1.0, [(0.0, 0.13), (3.3, 0.09)], seg=6, label='leg')
    for sz in (-1, 1):
        ka.gbox(p, (0, 20.2 + sz * 1.0, 1.5), (2.5, 0.12, 0.14))
    ka.gbox(p, (0, 20.2, 3.42), (2.9, 2.5, 0.24), ch=0.10, top_ch=0.05)
    ka.gbox(p, (0, 21.4, 3.98), (2.9, 0.16, 0.90), ch=0.05)
    for i in range(6):
        ka.gbox(p, (0, 19.0 - 0.0, 0.45 + i * 0.52), (1.5, 0.09, 0.09))
    p.emit()
    p = ka.GPart('awn_guard_top')
    ka.prism(p, [(ka.rect_plan(-1.9, 18.9, 1.9, 21.5), 4.62),
                 (ka.rect_plan(-0.5, 19.8, 0.5, 20.6), 5.15)], label='guard_canopy')
    p.emit()

    # clutter: towel bins and stacked crates — a lido has clutter, and clutter breaks a sightline
    for i, (bx, bz) in enumerate(((-8.6, 16.4), (8.6, 16.4), (-16.6, -17.4), (16.6, -17.4))):
        p = ka.GPart('bin%02d' % i)
        ka.lathe(p, bx, bz, [(0.0, 0.52), (0.86, 0.60), (0.96, 0.64), (1.02, 0.60)],
                 seg=6, label='bin')
        p.emit()

    # ── SPAWNS — the hand-built arena's twelve, unchanged, re-validated against this geometry ─
    # `js/s9pc-game.js` records that all twelve were authored and then verified against
    # blocks()/inBounds with a 32-ray sweep. Reusing the exact coordinates is what makes the two
    # arenas comparable: if the modelled one plays differently, it is the geometry that did it.
    for i, (sx, sz, sy) in enumerate(((-13.0, 10.0, 0.0), (13.0, 10.0, 0.0),
                                      (-13.0, -10.0, 0.0), (13.0, -10.0, 0.0),
                                      (-6.0, 12.0, 0.0), (6.0, 12.0, 0.0),
                                      (-21.0, 14.5, 0.0), (21.0, 14.5, 0.0),
                                      (-15.0, -9.0, 0.0), (15.0, -9.0, 0.0),
                                      (-15.0, -17.0, 0.0), (15.0, -17.0, 0.0))):
        ka.gspawn('l%d' % i, sx, sz, sy)
    ka.report()


LEVELS = {'arcade': build_arcade, 'vault': build_vault, 'rooftop': build_rooftop,
          'lido': build_lido}

if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if len(argv) < 2:
        print('usage: build-level.py -- <%s> <out.obj> [seed]' % '|'.join(LEVELS))
        sys.exit(1)
    name, out = argv[0], argv[1]
    seed = int(argv[2]) if len(argv) > 2 else 3030
    if name not in LEVELS:
        print('unknown level "%s" — have: %s' % (name, ', '.join(LEVELS)))
        sys.exit(1)
    reset()
    LEVELS[name](seed)
    export_obj(out)
    print('FOOTPRINT %s' % FOOTPRINT.get(name, 60.0))

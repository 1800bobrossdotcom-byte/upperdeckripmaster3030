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
#
# Every level is built for VERTICALITY, because RoninWorld's leap and boost only read as
# movement if there is something above you worth reaching. Each has a climb, a high walkway,
# and a drop.
#
# Authored in metres (Z-up); the exporter converts to Y-up. Bake with --scale set to the
# level's footprint so one world unit stays one metre.

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import (reset, Part, solid, post, stairs, railing, arcade_cabinet, claw_machine,
                 plinth, crate, rng, export_obj)                                    # noqa: E402

FOOTPRINT = {'arcade': 60.0, 'vault': 52.0, 'rooftop': 78.0}


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
        solid('balc%02d' % i, ((R - 3.0) * math.cos(a), (R - 3.0) * math.sin(a), 6.8),
              (4.6, seg_w, 0.5), a)
        post('col%02d' % i, ((R - 3.0) * math.cos(a), (R - 3.0) * math.sin(a), 3.3), 0.42, 6.6, 10)
    for i in range(SEG):
        a0, a1 = math.tau * i / SEG, math.tau * (i + 1) / SEG
        r_in = R - 5.1
        railing('balc_rail%02d' % i, (r_in * math.cos(a0), r_in * math.sin(a0), 7.05),
                (r_in * math.cos(a1), r_in * math.sin(a1), 7.05), height=1.0, post_every=3.0)
    stairs('balc_stair', (16.5, 8.0, 0), rise=0.44, run=0.52, width=3.4, steps=16, axis='y', sign=1)

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
    solid('bill_walk', (0, 13.2, 6.0), (12.0, 1.4, 0.25))
    railing('bill_rail', (-5.8, 12.6, 6.15), (5.8, 12.6, 6.15), height=0.95)

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
    for i in range(3):                                                    # antennae on our own roof
        post('mast%d' % i, (-15.0 + i * 1.6, -13.0, 3.0), 0.1, 6.0, 6)


LEVELS = {'arcade': build_arcade, 'vault': build_vault, 'rooftop': build_rooftop}

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

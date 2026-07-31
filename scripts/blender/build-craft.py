# upperdeckripmaster3030 — DOGFIGHT's geometry, authored in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-craft.py -- models/dogfight.glb
#   (or just: npm run craft)
#
# Everything dogfight draws in 3D was, until this file, typed out as vertex literals inside
# js/dogfight-gl.js: a nine-triangle delta wing and — for the 260 scenery props — four flat
# quads standing in an open box. That was the right call for Milestone 1 (prove the camera,
# ship nothing that needs a fetch) and it is the wrong call now. Geometry belongs in a modeller.
#
# ONE FILE, MANY PARTS. Everything goes out as a single GLB whose object names are the contract
# with the renderer:
#
#     craft          the interceptor — one object, because dogfight draws a ship as one VBO
#     pod            engine exhausts, drawn emissive when the throttle is open. Authored in the
#                    craft's frame and normalised with the craft, so it stays bolted on.
#     gate           the boost ring. Major radius 1.4 is not a look — it is dogfight.html's own
#                    pass-through test (`hypot(...) < 1.4`), so what you see IS the hitbox.
#     prop_pylon     the five world themes each name a prop silhouette (WORLDS[].prop in
#     prop_ring      dogfight.html). The 2D renderer has always drawn five different shapes and
#     prop_spire     the GL one drew a single box for all of them; these are those five, as
#     prop_tower     geometry. Authored ~1 unit tall and normalised to exactly 1 at load, so
#     prop_crystal   the game's own per-prop scale `s` (0.6–2.3) means height in world units.
#
# ORIENTATION, the one thing that is easy to get silently wrong:
#   kit.py's aircraft frame is +x nose / ±y span / +z up, which is comfortable to author and
#   correct in Blender's viewport. glTF export maps Blender (x, y, z) → (x, z, -y), so Blender
#   -y comes out glTF +z. dogfight-gl's ships have their nose along +z, so the craft and pod are
#   turned -90° about z before export. Props are upright already: Blender +z → glTF +y.
#
# Nothing here is textured or UV'd. The renderer tints every draw call from the ship's own
# colour, so a baked material would be dead weight — and one more thing to licence-clear.

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                                       # noqa: E402
import kit                                                                       # noqa: E402


# ── the interceptor ─────────────────────────────────────────────────────────────────────────
# Authored at roughly 10 m, which is a real fighter and a comfortable size to work at. Absolute
# scale does not survive: dogfight-gl normalises the craft's longest axis to its CRAFT constant,
# so this reads at exactly the on-screen size the procedural one did and a replacement model
# drops in without anyone retuning a number.

def build_craft():
    p = kit.Part('craft')

    # fuselage — tail at -4.0, nose at +6.2. The chin drops and the spine rises through the
    # middle stations so the body has a keel instead of reading as a flat slab from below.
    kit.hull(p, [
        (-4.00, 0.55, 0.52,  0.14),
        (-3.10, 1.00, 0.90,  0.08),
        (-1.60, 1.34, 1.16,  0.00),
        (-0.20, 1.40, 1.20, -0.02),
        ( 1.30, 1.20, 1.02,  0.02),
        ( 2.90, 0.86, 0.74,  0.00),
        ( 4.60, 0.44, 0.40, -0.02),
        ( 5.60, 0.18, 0.17, -0.02),
        ( 6.20, 0.05, 0.05, -0.02),
    ])

    # canopy — a second, shorter loft riding the spine. Its own chain rather than a bulge in the
    # fuselage stations, because a canopy that shares the body's cross-section widens the whole
    # nose with it.
    kit.hull(p, [
        (0.10, 0.62, 0.30, 0.62),
        (0.90, 0.74, 0.44, 0.66),
        (2.10, 0.64, 0.36, 0.60),
        (3.10, 0.34, 0.16, 0.50),
    ])

    # main wings — cranked delta, swept 2.4 m back over a 4.1 m half-span, with 0.5 m of
    # dihedral. Sweep is negative because sweep slides the tip along +x and +x is the nose.
    for sy in (-1, 1):
        kit.foil(p, (-0.60, sy * 0.62, -0.02), (-0.60, sy * 4.10, 0.46),
                 4.60, 1.15, 0.44, 0.11, sweep=-2.40)
        # wingtip rail — a little vertical fence, the thing that reads as "fighter" in
        # silhouette when the wing itself is edge-on and nearly invisible
        kit.foil(p, (-2.35, sy * 4.05, 0.42), (-2.35, sy * 4.05, 1.22),
                 1.05, 0.55, 0.16, 0.08, sweep=-0.30, axis='z')

    # canards — forward control surfaces. Small, but they break up the long nose so the craft
    # doesn't taper to a featureless point.
    for sy in (-1, 1):
        kit.foil(p, (2.55, sy * 0.44, 0.14), (2.55, sy * 1.75, 0.30),
                 1.35, 0.48, 0.22, 0.08, sweep=-0.70)

    # tailplanes + twin canted fins
    for sy in (-1, 1):
        kit.foil(p, (-3.20, sy * 0.42, 0.16), (-3.20, sy * 2.00, 0.34),
                 1.70, 0.62, 0.26, 0.09, sweep=-0.80)
        kit.foil(p, (-2.80, sy * 0.78, 0.40), (-2.80, sy * 1.30, 2.35),
                 2.30, 0.95, 0.28, 0.10, sweep=-1.05, axis='z')

    # engine nacelles, flanking the tail
    for sy in (-1, 1):
        kit.hull(p, [
            (-3.95, 0.62, 0.60, 0.16),
            (-3.30, 0.74, 0.72, 0.16),
            (-1.90, 0.78, 0.76, 0.14),
            (-1.10, 0.62, 0.60, 0.12),
        ])
        # offset the whole nacelle sideways — hull() lofts on the centreline, so shift the
        # vertices it just appended rather than growing the primitive a translation argument
        for i in range(len(p.v) - 16, len(p.v)):
            x, y, z = p.v[i]
            p.v[i] = (x, y + sy * 0.92, z)

    return p


def build_pod():
    """Engine exhausts. A separate object because dogfight-gl draws it with uEmit=1 — it is the
    glow that appears only while the throttle is open, so it cannot live inside the lit hull."""
    p = kit.Part('pod')
    for sy in (-1, 1):
        p.box((-4.02, sy * 0.92, 0.16), (0.30, 0.52, 0.50))
        p.box((-4.26, sy * 0.92, 0.16), (0.22, 0.34, 0.32))          # the flame stub behind it
    return p


# ── the boost gate ──────────────────────────────────────────────────────────────────────────

def build_gate():
    """Fly through it, get boost. Major radius 1.4 = the pass-through radius in dogfight.html.

    The 2D renderer draws this as a screen-space ellipse sized in PIXELS, so the ring you see
    and the ring you can actually collect have never been the same size. Authored geometry
    fixes that for free: the mesh is measured in the same world units as the test.
    """
    p = kit.ring('gate', (0, 0, 0), 1.40, 0.11, seg=28, ring_seg=7, rx=math.pi / 2)
    # four inner tabs, at the diagonals so they never hide behind the rim when it is edge-on
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        p.box((math.cos(a) * 1.16, 0.0, math.sin(a) * 1.16), (0.30, 0.10, 0.30), rz=0.0)
    return p


# ── scenery ─────────────────────────────────────────────────────────────────────────────────
# One per WORLDS[].prop silhouette. All authored base-at-z=0 and about 1 unit tall: the game
# already carries a per-prop scale, and the loader normalises height to exactly 1, so these
# proportions are what survives — not their size.

def build_props():
    out = []

    # pylon — splayed A-frame with a cross-brace and a lamp head. The neon-grid theme's prop.
    p = kit.Part('prop_pylon')
    for sx in (-1, 1):
        kit.foil(p, (sx * 0.30, 0.0, 0.0), (sx * 0.07, 0.0, 0.95),
                 0.16, 0.09, 0.16, 0.09, axis='z')
        kit.foil(p, (0.0, sx * 0.30, 0.0), (0.0, sx * 0.07, 0.95),
                 0.09, 0.05, 0.16, 0.09, axis='z')
    p.box((0, 0, 0.46), (0.52, 0.52, 0.05))
    p.box((0, 0, 0.99), (0.30, 0.30, 0.10))
    out.append(p)

    # ring — a torus on a stalk. The moon-ocean theme's, and the one the 2D draws as a flat
    # ellipse floating at nine-tenths height; the mesh keeps it there.
    p = kit.ring('prop_ring', (0, 0, 0.68), 0.34, 0.07, seg=18, ring_seg=6, rx=math.pi / 2)
    p.cyl((0, 0, 0.17), 0.05, 0.34, seg=8)
    p.box((0, 0, 0.02), (0.30, 0.30, 0.05))
    out.append(p)

    # spire — a needle in three tapering stages, ember-canyon's rock chimney.
    p = kit.Part('prop_spire')
    p.cyl((0, 0, 0.16), 0.11, 0.32, seg=7, r2=0.075)
    p.cyl((0, 0, 0.55), 0.075, 0.46, seg=7, r2=0.035)
    p.cyl((0, 0, 0.88), 0.035, 0.24, seg=7, r2=0.004)
    out.append(p)

    # tower — chrome city. Setbacks, because a plain extruded box is exactly the four-quad
    # placeholder this file exists to replace.
    p = kit.Part('prop_tower')
    p.box((0, 0, 0.22), (0.40, 0.40, 0.44))
    p.box((0, 0, 0.58), (0.30, 0.30, 0.30))
    p.box((0, 0, 0.80), (0.20, 0.20, 0.16))
    p.cyl((0, 0, 0.95), 0.02, 0.16, seg=5)
    for sx in (-1, 1):
        p.box((sx * 0.21, 0, 0.30), (0.03, 0.34, 0.36))              # pilaster ribs catch light
    out.append(p)

    # crystal — ghost nebula. A bipyramid with a girdle, the one prop that also reads floating
    # (18% of props spawn at altitude).
    p = kit.Part('prop_crystal')
    p.cyl((0, 0, 0.30), 0.02, 0.60, seg=6, r2=0.26)                  # lower point up to girdle
    p.cyl((0, 0, 0.72), 0.26, 0.24, seg=6, r2=0.20)
    p.cyl((0, 0, 0.94), 0.20, 0.20, seg=6, r2=0.01)                  # upper point
    out.append(p)

    return out


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[0] if argv else 'models/dogfight.glb'

    kit.reset()

    # -90° about z turns the authored +x nose into Blender -y, which the glTF exporter writes
    # as +z — the axis dogfight-gl's ship transform expects the nose to point down. Set on the
    # object rather than baked into the vertices so the authoring frame above stays readable,
    # and so the Blender viewport shows the craft the way it was designed.
    for part in (build_craft(), build_pod()):
        ob = part.emit()
        ob.rotation_euler = (0.0, 0.0, -math.pi / 2)

    build_gate().emit()
    for p in build_props():
        p.emit()

    kit.export_glb(out)


main()

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
#   -y comes out glTF +z. dogfight-gl's ships have their nose along +z, so the craft, pod and
#   trim are turned -90° about z before export. Props are upright already: Blender +z → glTF +y.
#
#   ⚠ THAT ROTATION IS WRITTEN ON THE glTF NODE, NOT BAKED INTO THE VERTICES — it is set on the
#   object below, deliberately, so the authoring frame above stays readable. A loader that reads
#   the mesh and ignores the node therefore gets an aircraft 90° across its own flight path, and
#   that is exactly what js/dfpc-app.js did until it was fixed. js/ronin-glb.js walks node
#   matrices and was always right. Do not "fix" this by baking the rotation in: the node
#   transform is part of the file, and any loader that cannot read one will break on the next
#   model out of any DCC tool anyway.
#
# ── THE BRIEF (docs/DESIGN-SYSTEM.md §8: material, light, motion, what it sits on, acceptance) ──
# The verdict on v1 was "basic bitch geometry and fx", and the reason a rewrite gets that verdict
# is that a mood is not a design. So, decided before any vertex:
#
#   1. MADE OF — die-cut card stock with a hot-foil flash. This studio makes printed objects; the
#      interceptor is not a machined aluminium jet, it is a CARD of one, punched out and folded.
#      Three of §1's four layers, as three named parts the renderer can shade differently:
#         craft  STOCK + INK — the dark printed body. Flat, saturated, no environment on it.
#         trim   FOIL — hot-stamped only where a real stamp goes: leading edges, canard and fin
#                tips, the intake lips, the canopy rail, a hairline down the nose spine. Metal,
#                and the ONLY metal.
#         pod    the exhaust, emissive.
#      §1's rule is that foil is defined by MOVEMENT, not colour, so the trim is thin-film
#      iridescent in the renderer — the hue walks with view angle because that is what a thin film
#      physically does, not because a gradient was painted on it.
#   2. LIT BY — the scene's swept sun is the KEY. The house RIM (cyan #27f7e4, near-grazing) is
#      what makes a die-cut edge read against a bright sky; that is §2's entire job for a rim.
#   3. WHAT MOVES — the foil's hue, because the craft rolls and the camera swings. The pod,
#      because the throttle is open. Nothing pulses.
#   4. SITS ON — the deck: it casts a real shadow onto it.
#   5. ACCEPTANCE — §1's own test: hue shift measured across several view angles. No shift, no
#      foil. Plus silhouette separation from the sky.
#
#   §7's rejection list, applied: no default extrude with a uniform bevel. The wing is CRANKED
#   (two lofted panels with a real kink, the outer more swept than the inner), the depth VARIES
#   along the span instead of tapering uniformly, and the bright rim is geometry — a separate
#   proud strip — rather than a shader trick on a plate edge.
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

    # main wings — a REAL cranked delta: two lofted panels meeting at a kink, the outer panel
    # more swept than the inner (42° then 56° on the leading edge). v1 called itself cranked and
    # was a single loft, i.e. a plain taper — which is §7's "default extrude + uniform bevel" in
    # planform, and it is why the wing read as a plate. The kink is also what puts VARIED DEPTH
    # in the section: thick box inboard (0.44), half that at the kink, a blade outboard (0.11).
    for sy in (-1, 1):
        kit.foil(p, (-0.60, sy * 0.62, -0.02), (-1.35, sy * 2.30, 0.20),
                 4.60, 3.10, 0.44, 0.26)
        kit.foil(p, (-1.35, sy * 2.30, 0.20), (-3.00, sy * 4.10, 0.46),
                 3.10, 1.15, 0.26, 0.11)
        # wingtip rail — a little vertical fence, the thing that reads as "fighter" in
        # silhouette when the wing itself is edge-on and nearly invisible
        kit.foil(p, (-2.35, sy * 4.05, 0.42), (-2.35, sy * 4.05, 1.22),
                 1.05, 0.55, 0.16, 0.08, sweep=-0.30, axis='z')
        # intake — the long nose tapered to a featureless point because there was nothing under
        # it. A pair of boxed intakes under the wing roots gives the forward half a shoulder line
        # and somewhere for the foil lips to sit.
        p.box((1.35, sy * 0.84, -0.26), (2.60, 0.56, 0.52))

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


def build_trim():
    """THE FOIL. A separate object because it is a different MATERIAL, not a different shape —
    the renderer draws it thin-film iridescent while the body stays flat printed ink.

    Where a hot stamp physically goes on a printed card: the die-cut edge and nothing else. Every
    strip below sits just PROUD of the edge it dresses, so it catches the rim light and reads as
    a cut rather than as a painted line — which is §7's "bright rim, varied depth" made of
    geometry instead of a shader. It is also the answer to the note in dfpc-app that hulls are
    "dark bodies with BRIGHT TRIM": there was no trim. There is now.

    ⚠ Fails open by name. dfpc-app draws this only if the part exists, so an older GLB — or one
    from a replacement model that has no trim — still flies, just without the flash.
    """
    p = kit.Part('trim')

    # nose spine — a hairline down the top of the long nose, from behind the canopy to the tip.
    # The single highest-value strip on the aircraft: the nose is the part of the silhouette that
    # points at whatever you are chasing, and it had no edge at all.
    kit.hull(p, [
        (2.90, 0.10, 0.07, 0.39),
        (4.60, 0.08, 0.06, 0.20),
        (5.60, 0.05, 0.04, 0.085),
        (6.18, 0.02, 0.02, 0.010),
    ])
    # canopy rail — the arch over the glass. A canopy without a frame reads as a bulge.
    kit.hull(p, [
        (0.05, 0.66, 0.06, 0.76),
        (0.95, 0.78, 0.06, 0.88),
        (2.15, 0.68, 0.06, 0.78),
        (3.15, 0.34, 0.05, 0.58),
    ])

    # ⚑ EVERY STRIP IS THICKER THAN THE SURFACE IT DRESSES, by ~0.04, and pushed ~0.09 forward of
    #   its leading edge. The first pass made them THINNER (0.36 against a 0.44 wing root) and
    #   flush, which buries a foil strip inside the hull and leaves a hairline — a stamp you
    #   cannot see is not a stamp. Proud is also what makes the rim light catch it, which is the
    #   whole job §2 gives a rim. Wing root 0.44→0.48, kink 0.26→0.30, tip 0.11→0.14, and the
    #   same +0.04 on every control surface.
    for sy in (-1, 1):
        # wing leading edge, both panels, following the crank
        kit.foil(p, (1.66, sy * 0.63, -0.02), (0.17, sy * 2.30, 0.20), 0.26, 0.20, 0.48, 0.30)
        kit.foil(p, (0.17, sy * 2.30, 0.20), (-2.45, sy * 4.09, 0.46), 0.20, 0.14, 0.30, 0.14)
        # canard and tailplane leading edges
        kit.foil(p, (3.20, sy * 0.46, 0.14), (2.07, sy * 1.74, 0.30), 0.18, 0.11, 0.26, 0.10)
        kit.foil(p, (-2.38, sy * 0.44, 0.16), (-3.70, sy * 1.99, 0.34), 0.18, 0.11, 0.30, 0.11)
        # fin leading edge — vertical, so axis='z': thickness runs across, span runs up
        kit.foil(p, (-1.71, sy * 0.80, 0.45), (-3.40, sy * 1.30, 2.32),
                 0.26, 0.14, 0.32, 0.12, axis='z')
        # wingtip rail cap
        p.box((-2.62, sy * 4.05, 1.24), (0.62, 0.10, 0.07))
        # intake lips — top and outboard, framing the mouth
        p.box((2.63, sy * 0.84, 0.00), (0.10, 0.60, 0.07))
        p.box((2.63, sy * 1.11, -0.26), (0.10, 0.07, 0.54))
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
    for part in (build_craft(), build_trim(), build_pod()):
        ob = part.emit()
        ob.rotation_euler = (0.0, 0.0, -math.pi / 2)

    build_gate().emit()
    for p in build_props():
        p.emit()

    kit.export_glb(out)


main()

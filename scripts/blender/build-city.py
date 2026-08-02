# ripmaster3030studios — DOGFIGHT's CITY, authored in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-city.py -- models/city.glb
#   (or just: npm run craft — build-craft.mjs builds this file too and asserts every part name)
#
# The ground under DOGFIGHT was 260 scattered prop silhouettes on an empty plane. The artist's
# note: "improve the cities below, make them with actual cities and skyscrapers and cars beneath,
# areas to fly through etc." This file is the KIT that city is built from. The LAYOUT — where each
# piece goes, how tall it is, where the streets run — is js/dfpc-city.js, because a layout is a
# seeded function of the theme and shipping 765 baked transforms would be shipping a screenshot.
#
# ── THE BRIEF (docs/DESIGN-SYSTEM.md §8) ───────────────────────────────────────────────────
# §9 of that file records the failure this section exists to prevent: material and light are the
# EASY half, because a renderer has features for them; §4 (what moves, and why it physically
# moved) has no feature to reach for and is the half that gets waved at. So it is answered first.
#
# 3. WHAT MOVES, AND WHY IT PHYSICALLY MOVED — three mechanisms, no loops.
#
#    (a) THE TRAFFIC MOVES BECAUSE IT IS ON A ROUTE. A car is not a twinkle and not a scrolling
#        texture — a scrolled texture is the city equivalent of a gradient painted on a face, i.e.
#        a *sticker of* traffic. Every car is a position `p` along a named one-way lane advancing
#        at that lane's speed: p = phase + v·t, wrapped by the 150-unit torus the map already is.
#        Lanes are straight, paired in opposing directions, and they belong to the corporation —
#        they run down the avenues because that is where the corporation put the road.
#        ⚑ It is checkable, and the acceptance test below checks it: p must advance by v·dt and
#        must not depend on where the camera is.
#    (b) NOTHING IN THE CITY MOVES ON ITS OWN. No rotating beacons, no blinking signs, no drifting
#        airships. The house rule from the hero wordmark holds — at rest it is a still object.
#        (Aircraft warning beacons on the tower crowns are STEADY, not flashing, for exactly this
#        reason. Real ones come both ways; only one of them obeys §4.)
#    (c) THE CITY MOVES BECAUSE YOU FLY THROUGH IT, AND THAT IS THE WHOLE POINT OF BUILDING IT.
#        js/dfpc-app.js already records the symptom: "the world is an open sky with nothing close
#        to parallax against", which is why thrust had to be faked with camera shove and a FOV
#        widen. A tower six units off the wingtip at cruise sweeps past at ~60°/s. The city IS the
#        parallax the flight model never had, and that is a measurement, not a mood.
#    (d) The shadows move because the sun swept — per MATCH (G.sunAz), not per frame.
#
# 1. MADE OF — §1's STOCK + INK, and deliberately NOT foil.
#    The interceptor is already foil (build-craft.py: hot stamp on the die-cut edges). If the city
#    were foil too it would compete with the craft for the one material that says "this is the
#    subject" — §5, one focal object per view. So the city is die-cut card stock printed in flat
#    saturated ink and stood up: dark masses, matte, and NO environment on any face (§1: "a flat
#    face must not reflect the environment"; CLAUDE.md's THE WASH records the cost when it does).
#    ⚑ ONE EXCEPTION, and it is docs/DELTRON-3030.md §2 rather than a material preference: the
#    CORPORATION IS THE ONLY SELF-LIT THING IN THE CITY. Sign crowns, hazard beacons and the
#    traffic lanes are emissive; everything a person built is dark stock lit by the sky. "Anything
#    the system says to you is corporate" — made physical, in one material split.
#
# 2. LIT BY — the scene's swept sun as KEY and the sky cubemap as FILL, i.e. exactly what already
#    lights the craft, the props and the deck. A second light for the city would be a second
#    opinion about what time of day it is.
#    ⚑ THE CITY IS LIT BY THE SKY, NOT BY ITS OWN WINDOWS, and that follows from the palette that
#    already shipped rather than from taste. js/dfpc-world.js inverted every theme's values on
#    purpose because "against a void a dark craft has no silhouette at all". A city of glowing
#    windows puts a field of bright points behind a dark craft and destroys precisely that. Under a
#    bright sky, real windows are dark. So the mass is dark stock and its contribution to the frame
#    is SILHOUETTE and SHADOW — and a tower is the first object in this game big enough to throw a
#    shadow you can fly through.
#
# 4. SITS ON — the deck (js/dfpc-world.js), and it is DIMENSIONED BY it: the street grid pitch is
#    10 units and every street centreline lands on a multiple of the deck texture's own 2-unit
#    lattice STEP. A city whose plan disagrees with the ground it stands on reads as two layers.
#    Every base is on y = 0 and every LOD0 chunk casts a real shadow onto the deck.
#    The tallest downtown cores reach 8.8 of a 9.0 ceiling and therefore PIERCE the cloud deck at
#    5.4 ± 0.9 — above the weather you navigate by tower tops sticking out of cloud.
#
# 5. ACCEPTANCE — see js/dfpc-city.js's header for the numbers this build is measured against, and
#    scripts/build-craft.mjs for the two that are asserted at BUILD time rather than written down:
#    every part name exists, and hero_gantry's opening is wide enough to fly an avenue through.
#
# ── THE ONE AUTHORING CONSTRAINT, and it is not obvious ────────────────────────────────────
# ⚠ EVERY BODY PART IS STRETCHED VERTICALLY AT PLACEMENT. A kit part is authored in a unit cube
#   and placed with a NON-UNIFORM scale — footprint in x/z, HEIGHT in y — so one mesh serves a
#   1.4-unit shed and an 8.8-unit tower. That means:
#
#       detail that runs VERTICALLY (pilasters, mullion ribs, corner posts) stretches correctly
#       detail placed at a FRACTION of height (setbacks, collars, a ziggurat's steps) stretches
#         correctly, because a stepped tower's steps are proportional in the first place
#       detail with an ABSOLUTE thickness (a 0.05 roof slab, a parapet) does NOT — on an 8.8-unit
#         tower it becomes a 0.44-unit slab, which reads as a plinth on the roof
#
#   So: parapets and roof furniture are NOT in the body parts. They are `cap_*`, placed separately
#   at the top with a scale tied to the FOOTPRINT only. Same reason `sign_crown` is its own part —
#   it also has to be a different MATERIAL (emissive), and one mesh is one material.
#
# ── PARTS, which are the contract with js/dfpc-city.js ─────────────────────────────────────
#   blk_slab   blk_rib   blk_twin   blk_pod   blk_step        LOD0 bodies, unit cube, base at z=0
#   blk_*_lo                                                  LOD1: same SILHOUETTE, ~a third the
#                                                             triangles, no ribs, no roof clutter.
#                                                             Silhouette-preserving on purpose —
#                                                             the LOD pop is then a DETAIL pop at
#                                                             14 units, not a shape pop
#   cap_plant  cap_deck                                       roof furniture, footprint-scaled
#   sign_crown                                                the emissive band. ONE box: from
#                                                             outside a band is a box, and its top
#                                                             and bottom rims are the band's edges
#   hero_gantry  hero_stack  hero_mast                        the three landmarks, one-offs
#
# Orientation: upright, so Blender +z → glTF +y with no node rotation at all. (build-craft.py's
# craft carries a −90° NODE rotation and CLAUDE.md records what that cost a loader that ignored
# it; nothing here needs one, and js/dfpc-city.js honours node transforms anyway.)
# Nothing is textured or UV'd — the renderer tints every draw call.

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                                       # noqa: E402
import kit                                                                       # noqa: E402


# ── bodies ──────────────────────────────────────────────────────────────────────────────────
# All five fill roughly x,y ∈ [-0.5, 0.5] and z ∈ [0, 1]. js/dfpc-city.js MEASURES the bound and
# normalises all three axes to 1 with the base on the origin, so these proportions are what
# survives and the exact numbers below are not load-bearing — a replacement part drops straight in.

def blk_slab():
    """The corporate default: a slab with two proportional setbacks and corner posts.

    §7's rejection list bans the default extrude with a uniform bevel. The setbacks are at 0.61
    and 0.85 of HEIGHT rather than at fixed distances, so a 2-unit shed and an 8-unit tower both
    step in the same places relative to themselves — which is what a real setback ordinance does.
    """
    p = kit.Part('blk_slab')
    p.box((0, 0, 0.305), (0.88, 0.74, 0.61))
    p.box((0, 0, 0.730), (0.66, 0.56, 0.24))
    p.box((0, 0, 0.925), (0.44, 0.38, 0.15))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((sx * 0.42, sy * 0.355, 0.305), (0.07, 0.07, 0.63))     # corner posts
    for sy in (-1, 1):
        p.box((0, sy * 0.372, 0.305), (0.44, 0.045, 0.60))                # one mullion band a side
    return p


def blk_rib():
    """The tall one. A square core wearing six full-height pilasters.

    ⚑ Pilasters are the part of this kit that most needs the raking key light §2 specifies: a
    flat face under a high sun is one value, and six proud ribs turn it into six lit strips and
    six shadowed ones. That is the cheapest silhouette-into-surface conversion available, and it
    is the only detail that survives being stretched to 8.8 units.
    """
    p = kit.Part('blk_rib')
    p.box((0, 0, 0.5), (0.72, 0.72, 1.0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((sx * 0.355, sy * 0.355, 0.5), (0.11, 0.11, 0.99))
    for sx in (-1, 1):
        p.box((sx * 0.375, 0, 0.5), (0.075, 0.26, 0.99))
    p.box((0, 0, 0.955), (0.84, 0.84, 0.07))                              # collar, proportional
    return p


def blk_twin():
    """Two cores joined by a sky-bridge — the one body with a HOLE in it.

    A skyline of solid blocks reads as a bar chart. One shape you can see daylight through is what
    makes the row read as buildings, and at the sizes the layout uses the gap is wide enough to
    fly between the cores, which is the same argument as the avenues one scale down.
    """
    p = kit.Part('blk_twin')
    for sx in (-1, 1):
        p.box((sx * 0.245, 0, 0.5), (0.40, 0.62, 1.0))
        p.box((sx * 0.245, 0, 0.985), (0.46, 0.68, 0.05))
    p.box((0, 0, 0.605), (0.30, 0.34, 0.085))                             # bridge
    return p


def blk_pod():
    """Low and broad: the outskirts, the depot, the thing a tower stands next to.

    The loading-bay ribs on one face are the only part of the kit that says which way a building
    FRONTS, and the layout turns pods to face the nearest street so a block has a front and a back.
    """
    p = kit.Part('blk_pod')
    p.box((0, 0, 0.36), (0.96, 0.90, 0.72))
    p.box((-0.16, 0.10, 0.86), (0.44, 0.40, 0.28))                        # service block
    p.box((0.28, -0.14, 0.80), (0.14, 0.52, 0.16))                        # duct run
    for k in (-1, 0, 1):
        p.box((k * 0.28, -0.465, 0.22), (0.16, 0.055, 0.42))              # loading bays
    return p


def blk_step():
    """Ziggurat. Four proportional steps, so it reads the same at any height."""
    p = kit.Part('blk_step')
    p.box((0, 0, 0.16), (0.96, 0.92, 0.32))
    p.box((0, 0, 0.44), (0.78, 0.74, 0.26))
    p.box((0, 0, 0.66), (0.58, 0.56, 0.20))
    p.box((0, 0, 0.84), (0.38, 0.36, 0.18))
    p.cyl((0, 0, 0.965), 0.030, 0.17, seg=5)
    return p


# ── LOD1 ────────────────────────────────────────────────────────────────────────────────────
# ⚑ SILHOUETTE-PRESERVING, NOT SIMPLIFIED-BY-DECIMATION. Each _lo keeps the masses that make the
#   OUTLINE and drops only what carries surface — ribs, bays, roof clutter. A decimator would take
#   the triangles off wherever they were cheapest and change the outline, and an outline change at
#   14 units is a building visibly becoming a different building as you close on it.

def blk_slab_lo():
    p = kit.Part('blk_slab_lo')
    p.box((0, 0, 0.305), (0.88, 0.74, 0.61))
    p.box((0, 0, 0.730), (0.66, 0.56, 0.24))
    p.box((0, 0, 0.925), (0.44, 0.38, 0.15))
    return p


def blk_rib_lo():
    p = kit.Part('blk_rib_lo')
    p.box((0, 0, 0.5), (0.76, 0.76, 1.0))                                 # +ribs' own proudness
    p.box((0, 0, 0.955), (0.84, 0.84, 0.07))
    return p


def blk_twin_lo():
    p = kit.Part('blk_twin_lo')
    for sx in (-1, 1):
        p.box((sx * 0.245, 0, 0.5), (0.40, 0.62, 1.0))
    p.box((0, 0, 0.605), (0.30, 0.34, 0.085))
    return p


def blk_pod_lo():
    p = kit.Part('blk_pod_lo')
    p.box((0, 0, 0.36), (0.96, 0.90, 0.72))
    p.box((-0.16, 0.10, 0.86), (0.44, 0.40, 0.28))
    return p


def blk_step_lo():
    p = kit.Part('blk_step_lo')
    p.box((0, 0, 0.22), (0.96, 0.92, 0.44))
    p.box((0, 0, 0.72), (0.62, 0.60, 0.56))
    return p


# ── roof furniture ──────────────────────────────────────────────────────────────────────────
# Placed at the top with a FOOTPRINT-only scale, so a tank on a 9-unit tower is the same size as a
# tank on a 2-unit shed. That is the whole reason these are not inside the bodies.

def cap_plant():
    """Tanks, a duct and a stub mast. Deltron §4's register: a future that is patched, not clean."""
    p = kit.Part('cap_plant')
    p.cyl((-0.16, 0.10, 0.30), 0.15, 0.60, seg=6)
    p.box((0.20, -0.06, 0.20), (0.34, 0.40, 0.40))
    p.box((0.02, 0.34, 0.44), (0.06, 0.06, 0.88))
    return p


def cap_deck():
    """A landing pad with a rail — a roof somebody uses."""
    p = kit.Part('cap_deck')
    p.box((0, 0, 0.06), (0.86, 0.86, 0.12))
    for sy in (-1, 1):
        p.box((0, sy * 0.40, 0.22), (0.88, 0.05, 0.20))
    p.box((-0.30, 0.02, 0.34), (0.16, 0.16, 0.44))
    return p


def sign_crown():
    """THE CORPORATE BAND — the one emissive body part.

    ONE box, on purpose. Seen from outside, a band around a tower IS a box; the top and bottom
    faces read as the band's own rims. Four boxes would be four times the triangles on the part
    that gets instanced onto every tall building in the city, to draw a hollow nobody can see.
    """
    return kit.Part('sign_crown').box((0, 0, 0.5), (1.0, 1.0, 1.0))


# ── heroes ──────────────────────────────────────────────────────────────────────────────────
# Three landmarks, placed once each per city. A skyline of interchangeable blocks has no way to
# say WHERE you are; a landmark is how a player navigates a 150-unit torus without a map.
#
# ⚠ These are fitted by HEIGHT like everything else, so their ASPECT is what decides whether the
#   gantry's opening still spans an avenue. build-craft.mjs asserts it rather than trusting it.

def hero_gantry():
    """A portal frame straddling an avenue: you fly THROUGH it.

    ⚑ This is the answer to "what makes a canyon read as flyable rather than as scenery". A gap is
    ambiguous — it might be a gap between two things or a way through. A FRAMED gap is not: a
    portal is a thing with a near side and a far side, and the only thing to do with one is pass
    it. It is also the corporation's arch over the corporation's road, which is §2 of DELTRON.
    Authored 9.6 wide × 7.0 tall (aspect 1.371) so that at the layout's 7.0-unit target height the
    clear opening is ~7.6 — wider than the 7.2 avenue it stands over.
    """
    p = kit.Part('hero_gantry')
    for sx in (-1, 1):
        x = sx * 4.30
        p.box((x, 0, 2.60), (0.62, 0.98, 5.20))                           # leg
        p.box((x, 0, 5.35), (0.46, 0.74, 0.50))                           # leg head
        p.box((x + sx * 0.30, 0, 0.22), (1.30, 1.30, 0.44))               # foot
        for k in (0, 1, 2):                                               # lattice rungs
            p.box((x, 0, 1.05 + k * 1.40), (0.80, 1.06, 0.16))
        p.box((x - sx * 0.95, 0, 5.95), (2.30, 0.60, 0.34), rz=0.0)       # haunch
    p.box((0, 0, 6.40), (9.60, 1.10, 0.92))                               # the beam
    p.box((0, 0.60, 6.40), (7.20, 0.10, 0.62))                            # sign face (front)
    p.box((0, -0.60, 6.40), (7.20, 0.10, 0.62))                           # sign face (back)
    p.box((0, 0, 6.94), (9.90, 0.86, 0.16))                               # capping rail
    return p


def hero_stack():
    """Cooling stacks over a turbine hall. The corporation's plant — the thing the city is FOR."""
    p = kit.Part('hero_stack')
    p.box((0, 0, 0.90), (5.60, 4.20, 1.80))                               # hall
    p.box((0, 0, 2.05), (5.90, 4.50, 0.50))                               # hall parapet
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cyl((sx * 1.55, sy * 1.20, 4.10), 0.86, 4.20, seg=8, r2=0.62)
            p.cyl((sx * 1.55, sy * 1.20, 6.34), 0.68, 0.36, seg=8)        # stack lip
    p.box((0, 0, 3.30), (3.40, 0.44, 0.34))                               # pipe bridge
    p.box((0, 0, 4.60), (0.44, 2.90, 0.34))
    return p


def hero_mast():
    """A broadcast mast — tall, thin, and the only piece that reaches past the cloud deck alone.

    Guy wires are boxes, not cylinders: at the width a wire actually is, a 6-sided tube spends 24
    triangles to look exactly like a 12-triangle rod does at 20 units.
    """
    p = kit.Part('hero_mast')
    p.box((0, 0, 0.35), (2.60, 2.60, 0.70))                               # pad
    p.cyl((0, 0, 2.30), 0.78, 3.30, seg=6, r2=0.46)
    p.cyl((0, 0, 5.10), 0.46, 2.40, seg=6, r2=0.26)
    p.cyl((0, 0, 7.35), 0.26, 2.20, seg=6, r2=0.10)
    p.box((0, 0, 8.70), (0.90, 0.90, 0.22))                               # dish collar
    p.cyl((0, 0, 9.20), 0.07, 0.90, seg=4)                                # whip
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        p.box((math.cos(a) * 0.95, math.sin(a) * 0.95, 1.90), (0.10, 0.10, 3.60), rz=a)
    return p


PARTS = [blk_slab, blk_rib, blk_twin, blk_pod, blk_step,
         blk_slab_lo, blk_rib_lo, blk_twin_lo, blk_pod_lo, blk_step_lo,
         cap_plant, cap_deck, sign_crown,
         hero_gantry, hero_stack, hero_mast]


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[0] if argv else 'models/city.glb'
    kit.reset()
    for fn in PARTS:
        fn().emit()
    kit.export_glb(out)


main()

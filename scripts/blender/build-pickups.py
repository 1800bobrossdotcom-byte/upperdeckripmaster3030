# ripmaster3030studios — the five FIELD PRIZES (power-up pickups), authored in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-pickups.py -- models/pickups.glb
#
# ⛔ WHY THIS FILE EXISTS. Section 9's pickups are not placeholder geometry — they are NO geometry.
#    js/s9pc-fx.js draws every pickup as TWO CAMERA-FACING BILLBOARD QUADS: a bobbing coloured core
#    and a wide halo. All that separates one pickup from another is an RGB triple. So:
#      · every pickup has the same silhouette, from every angle, at every distance — IoU 1.000;
#      · the only channel carrying meaning is COLOUR, which is the first thing bloom eats, the
#        first thing a colour-blind player loses, and the channel this container cannot even
#        screenshot faithfully (SwiftShader rotates hue on canvas content);
#      · and the motion is `Math.sin(t*3)*0.12` on the height and `0.72+0.28*sin(t*4)` on the size,
#        i.e. exactly the "pulse, breathe, shimmer or drift for their own sake — a loop the eye can
#        learn is a screensaver" that docs/DESIGN-SYSTEM.md §4 rules out by name.
#    The artist's note was "redesign power up items". The placeholder is the DESIGN, not just the
#    mesh, so both are replaced here.
#
# ONE FILE, SIX NAMED PARTS — the same contract as models/dogfight.glb and models/weapons/
# s9-guns.glb, whose object names ARE the interface with the renderer:
#
#     pu_base      the issue bay. ONE mesh, instanced under all five. Never moves.
#     pu_rush      THE TOP      a spinning top, barbed, winding down          ← MOBS.rush
#     pu_hover     THE LENS     a saucer holding station over its own bay     ← MOBS.hover
#     pu_flight    THE ROTOR    a three-bladed upright, weathervaning         ← MOBS.flight
#     pu_spring    THE BOOT     one cartoon boot on a coil spring             ← MOBS.spring
#     pu_slip      THE GLASS    an hourglass lying down, on the wrong clock   ← MOBS.slip
#
# ⚑ THE PART NAME IS THE MOB KEY, exactly. js/s9pc-game.js's `MOBS` table names these five
#   rush/hover/flight/spring/slip, so the loader is `'pu_' + pw.type` and there is no translation
#   table anywhere — ROADMAP §5.4, "two copies of a fact will diverge". A sixth verb becomes a
#   part in this file and needs no line of JavaScript.
#
# Adding the other three pickups later (med / armor / ammo) is a change to THIS FILE and to
# nothing else — the loader is a name lookup, so `pu_med` would be picked up with no hook change.
#
# ════════════════════════════════════════════════════════════════════════════════════════════════
# THE BRIEF — docs/DESIGN-SYSTEM.md §8. Written before any vertex, because §9 records that two
# hero wordmarks were rejected and that BOTH answered §1 (material) and §2 (light) well while
# skipping §4. A renderer HAS FEATURES for material and light, so an agent answers those and feels
# finished; §4 has nothing to reach for and has to be designed. This brief is ordered 4-first for
# that reason.
# ════════════════════════════════════════════════════════════════════════════════════════════════
#
# 1 · WHAT IT IS MADE OF — a CHEAP MOULDED PRIZE, die-struck, sitting on a machined issue plate.
#
#   docs/CC0-SOURCES.md: "the artist's own Fake Rares work is the natural first source". His cards
#   are hand-drawn, high-contrast, flat saturated ink, deliberately crude registration — giant
#   gloved hands, oversized oval shoes, a heavy black keyline doing all the work. The opposite of
#   the smooth bevelled corporate CG a default pipeline emits.
#
#   Translated into geometry, that is three decisions and they are the whole material language:
#
#   (a) FLAT INK ⇒ FLAT FACETS. Every solid of revolution here is seg 8–12, never 32. Hard creases,
#       no smoothing, chunky. The low poly count is not a budget concession; it is the ink.
#   (b) HEAVY KEYLINE ⇒ THE DIE-LINE, and it is the layer docs/DESIGN-SYSTEM.md §1 records as
#       "⛔ nowhere yet". ⚑ A keyline is BY DEFINITION the outline, and an outline is view-
#       dependent — so it cannot be baked into geometry. Authored ribs glow where you put them; a
#       fresnel rim glows exactly on the silhouette, from every bearing, which is what a keyline
#       IS. The die-line is therefore the renderer's (see THE HOOK below), and this file's job is
#       to give it something to sit on: every flare, girdle and sole carries a real chamfer band
#       so the rim lands on a surface rather than on a zero-width edge. §7's "die-cut profile:
#       chamfer, micro-bevel, bright rim" made of geometry instead of a shader trick.
#   (c) CRUDE REGISTRATION ⇒ THE PARTS DO NOT LINE UP, ON PURPOSE. The top's barbs are not
#       concentric. The hourglass's upper bell is offset from its lower. The boot's spring sits
#       off-centre under the heel. The saucer's dome is nudged off its skirt. ⚑ This is the
#       cheapest decision in the build — it costs ZERO triangles — and it is the single thing that
#       stops a lathe from reading as a default CG lathe. It is also seeded and fixed, so the mesh
#       is byte-reproducible (kit.py's rule 2).
#
#   THE PLATE IS THE OTHER HALF, and it is deliberately the opposite material. docs/DELTRON-3030.md
#   §2: "anything the system says to you is corporate; anything a person made is hand-drawn — never
#   mix them in one element." So they are two elements: the plate is MILLED — a registered disc
#   with a chamfered rim, a raised boss and four index notches, precise and cold. The prize on top
#   is hand-cut and crooked. The arena issued the plate; somebody's hand made the toy.
#
# 2 · HOW IT IS LIT — it is the one object in the arena that is lit from INSIDE.
#
#   ⚠ The obvious answer, "make it bright", is wrong here and the repo already says why:
#     js/s9pc-world.js holds arena walls at 0.60–0.70 albedo precisely so a DARK silhouette reads
#     against them (which is why the guns are 0.20). A bright object in a bright room does not pop.
#   So the body stays in the same dark band as the guns and the bodies (0.18–0.24) and the DIE-LINE
#   is what emits. At 30 m you do not see a lit object; you see a bright OUTLINE in a distinctive
#   shape. That is precisely how the artist's own cards work — the black keyline carries the form
#   and the fills sit inside it — inverted for a dark game, where a keyline has to be light.
#   The house keys (§2) do the rest: KEY green rakes it, RIM cyan #27f7e4 picks the die-cut edge
#   out of the dark. ⛔ NOT the ownership colours: js/s9pc-game.js's law is YOURS COOL / THEIRS
#   WARM, and a pickup belongs to nobody — putting it on either side of that law would make the
#   arena lie about whose it is. Gold #ffd23b is the accent and it is the plate's, not the prize's.
#
# 3 · WHAT MOVES, AND WHY IT PHYSICALLY MOVED. ⚑ The half that gets skipped. It is skipped here by
#   nobody, because it is what the item is FOR: each prize's idle motion is its own verb, performed
#   on itself. You know what a pickup does before you touch it, without reading the HUD.
#
#     pu_rush   ANGULAR MOMENTUM, DECAYING. It is a top; someone flicked it and it is winding
#                down. It wobbles because its barbs are genuinely off-axis (decision 1c — the
#                misregistration and the wobble are the same fact). When it finally stops it
#                topples onto the plate and rings. Spin-up happens when a body comes near: the
#                arena noticed you. ⛔ It is the only item whose motion DECAYS, which is why it
#                cannot be mistaken for a pulse.
#     pu_hover   STATION-KEEPING. It floats — and it is the ONLY one that does — so it drifts off
#                its mark and CORRECTS: a slow slide, then a snap back. Not a sine. A sine is a
#                thing being animated; a drift-and-correct is a thing holding position badly.
#     pu_flight  WEATHERVANING. A light lifting surface on a thin stem, in a room with fog and
#                haze moving through it, turns to face the draught and rocks in it. The wing is
#                authored with real chord and thickness taper so the rock reads as a surface
#                catching air rather than as a rotation.
#     pu_spring   LOAD AND FIRE. The spring compresses slowly, then releases with a snap and an
#                OVERSHOOT, then rings out. ⚑ This is the studio's entire subject — the pull and
#                the snap-back IS anticipation, the same event as a pack rip. The interval is
#                irregular and seeded per instance so two boots in one arena are never in phase,
#                which is what stops it becoming a loop the eye can learn.
#     pu_slip  ⚑ THE WRONG TIME-BASE, and it is the best one in the set. Everything else in the
#                arena runs at 1.0×; this object runs at 0.25×. Its swing is slow and heavy, with
#                far more inertia than an object that size should have. It does not depict slow
#                motion — it IS slow, in a frame where nothing else is, and that wrongness is the
#                read. No other object in this game can say what it does by moving.
#
#   ⛔ NOTHING BOBS. Nothing pulses, breathes or shimmers. Nothing scales on a sine. Every motion
#      above is a physical consequence of a force, a fluid or a spring, and every one of them can
#      be at rest — a taken pickup stops dead rather than fading out on a curve.
#   ⚑ THE GEOMETRY IS BUILT SO THE MOTION IS POSSIBLE, which is the part that has to happen here:
#      the prize is a SEPARATE NODE from its plate, so every motion above is one transform on one
#      node, and the plate — the corporate half — never moves. That split is the whole reason
#      `pu_base` exists as its own part instead of being merged into each item.
#
# 4 · WHAT IT SITS ON — the issue plate, on the arena floor, casting a real shadow.
#   §5: "everything sits ON something. Floating UI is the failure mode; a printed object always
#   has a surface under it." The current billboard floats over nothing at a bobbing height, which
#   is the failure mode exactly. ⚑ And the plate is what makes HOVER legible: a thing floating over
#   nothing is just a thing at a height. A thing floating over its own empty plate, with arena
#   floor visible through the 0.15 m gap, is HOVERING. The gap is authored INTO the mesh, so the
#   game places every item the same way — origin on the floor — and hover floats for free.
#
# 5 · THE ACCEPTANCE MEASUREMENT — silhouette distinctness, and it is checked at BUILD TIME.
#
#   The design problem in one sentence: five items that read as five different things in a
#   firefight, at low resolution. So the test is that sentence, as a number.
#
#   ⚑ THREE THINGS THIS MEASURES THAT `npm run test:guns` DOES NOT, each because a pickup is a
#     different kind of object from a gun:
#     (a) EVERY BEARING, not one. A gun is seen side-on in another operative's hands; a pickup is
#         walked around. A shape that is distinctive from the front and identical from 90° away
#         fails in play and passes a single-view test. IoU is taken per pair as the WORST over 12
#         bearings × 2 depression angles (4° ≈ eye height at 25 m, 20° ≈ a close approach).
#     (b) AT THE SIZE IT IS ACTUALLY DRAWN. A 0.45 m object at 25 m through fov 0.97 subtends
#         ~18 px. So the silhouettes are rasterised fine, then box-downsampled to a 16 px frame
#         with a coverage threshold — the way a GPU actually loses a thin wingtip. Detail that
#         only separates two items at 112 px is detail the player never has.
#     (c) IN A COMMON WORLD-SPACE WINDOW, not normalised per item. test-guns.mjs normalises each
#         gun to its drawn length on purpose, because the game rescales them. Nothing rescales a
#         pickup, so "one is bigger" is a real difference here and must count.
#   Reported both ways — prize-only and prize+plate — because the plate is shared and therefore
#   works AGAINST distinctness; the gate is on prize+plate, which is what is on screen.
#
#   ⛔ THE BUILD REFUSES TO WRITE A GLB THAT FAILS. Same discipline as scripts/flatten.mjs, which
#      will not emit a flattened contract whose bytecode differs. Five billboards score 1.000 and
#      five names on one mesh score 1.000; neither can ever leave this script.
#
# ── ORIENTATION ─────────────────────────────────────────────────────────────────────────────────
# Authored in kit.py's level frame: Z UP, base of the item at z = 0, +x is the boot's toe. The
# glTF exporter maps Blender (x, y, z) → (x, z, −y), so +z becomes glTF +y and the items stand up
# in a Y-up engine with no fixing. No node rotation is written — build-guns.py's rule: a rotation
# nobody needs is a rotation a loader can drop.
# ⚠ Section 9 hangs everything in game coordinates under `app.__worldMirror` at scale (−1, 1, 1).
#   Four of the five are near-symmetric about x and do not care; the BOOT's toe flips, which is
#   cosmetically fine and is called out here so nobody later reports it as a bug.
#
# ── THE HOOK (js/s9pc-app.js — one block, no game logic) ────────────────────────────────────────
#   fetch models/pickups.glb once → for each live G.pows entry whose `type` maps to a part name,
#   instantiate `pu_base` + `pu_<type>` under app.__worldMirror at (pw.x, floor, pw.z).
#   MATERIALS the renderer must supply (this file ships no materials — kit.export_glb drops them,
#   deliberately, so nothing here needs licence clearing):
#       body   diffuse 0.19–0.24, metalness 0.35, gloss 0.30      — the guns' band, so it does not
#                                                                   out-shout the operative on it
#       rim    emissive, per item, driven by a fresnel term       — THE DIE-LINE (decision 1b)
#       plate  diffuse 0.26, metalness 0.75, gloss 0.55, gold rim  — machined, corporate, cold
#   ⚠ KEEP THE HALO. The geometry replaces the fx CORE billboard only. The wide soft halo is what
#     makes a pickup findable across a 52 m arena, and deleting it would read as a regression even
#     though the object got better.
#   ⚠ FAIL OPEN. A 404, a bad decode or a missing part must leave the billboard drawing and the
#     match playable. Nothing in the game may depend on this file existing.

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit                                                     # noqa: E402

TAU = math.pi * 2

# The item family's shared dimensions. Everything is measured off these, so a size change is one
# number rather than a hunt — the same rule build-craft.py uses for its measured fits.
# ⛔ THE PLATE IS A DASHED INLAY RING, AND IT TOOK TWO MEASURED DEMOTIONS TO GET THERE. It began
#   as a 0.34 m × 0.046 m machined puck. Shared geometry works directly AGAINST the one hard
#   requirement of this job, and the measurement said how hard: at the close depression the puck
#   projected to ~20 identical lit cells against silhouettes of only 50–90 cells, i.e. it put a
#   floor of ~0.17 under EVERY pair's IoU before the prizes were even compared, and cost +0.09 to
#   +0.12 on the worst pair. Flattening it to an inlay disc recovered about half of that; the rest
#   is only recoverable by removing AREA, so the disc became a ring and the ring became dashes.
# ⚑ And it is a better object for it. §5's "everything sits ON something" is satisfied by a BAY
#   MARKED OUT ON THE FLOOR at least as well as by a plinth — an object standing in a registered
#   bay is issued, an object standing on a puck is packaged. The dashes are also more legible as
#   the corporate half of the DELTRON-3030 §2 split than a milled disc was: they read as painted
#   floor registration, machine-set, in a place where everything else is hand-cut and crooked.
PLATE_R = 0.104          # inlay ring radius
PLATE_TOP = 0.009        # the prizes stand on the floor, inside the ring
GAP = 0.150              # hover's floor gap. The single strongest distance cue in the set.


# ── helpers ─────────────────────────────────────────────────────────────────────────────────────

def lathe(p, z0, z1, r0, r1=None, seg=10, dx=0.0, dy=0.0):
    """One flat-facetted lathe section between two heights, optionally NUDGED OFF AXIS.

    `dx`/`dy` are decision 1c — crude registration, as geometry. kit.Part.cyl appends exactly
    2 × seg vertices, so the nudge walks back over the ones it just wrote; it is applied here
    rather than by translating an object because a Part's vertices are supposed to already be
    where they belong (kit.py's contract, and the reason kit.ring is hand-built).
    """
    n0 = len(p.v)
    p.cyl((0.0, 0.0, (z0 + z1) / 2.0), r0, z1 - z0, seg, r0 if r1 is None else r1)
    if dx or dy:
        for i in range(n0, len(p.v)):
            x, y, z = p.v[i]
            p.v[i] = (x + dx, y + dy, z)
    return p


def spoke(p, ang, rad, z0, z1, w=0.018, t=0.018):
    """A vertical post standing off the axis at a bearing — an hourglass frame rail, a spring
    connector. Boxed rather than lathed: a post is a cut strip of stock, not a turning."""
    return p.box((math.cos(ang) * rad, math.sin(ang) * rad, (z0 + z1) / 2.0),
                 (w, t, z1 - z0), ang)


def spin_last(p, n, ang):
    """Rotate the last `n` appended vertices about Z.

    ⚠ kit.foil builds its section with chord along +x and span along ±y and takes no rotation, so
    a blade at 120° cannot be expressed in its arguments. Spinning the vertices it just wrote is
    the kit-honest way to do it — a Part's vertices are supposed to already be where they belong,
    which is why kit.ring is hand-built rather than using bpy.ops.
    """
    ca, sa = math.cos(ang), math.sin(ang)
    for i in range(len(p.v) - n, len(p.v)):
        x, y, z = p.v[i]
        p.v[i] = (x * ca - y * sa, x * sa + y * ca, z)
    return p


def tip_over(p, ang, rest):
    """Lean the WHOLE part about Y, then set it back down so its lowest point rests on `rest`.

    ⚑ A diagonal is the strongest silhouette discriminator there is, because every other item in
    this set is an upright standing on a plate, and an upright object of one size is very often
    CONTAINED inside an upright object of another — which is what an IoU of 0.74 means. A lean
    breaks containment from every bearing at once, and it costs nothing but a rotation.
    """
    ca, sa = math.cos(ang), math.sin(ang)
    for i in range(len(p.v)):
        x, y, z = p.v[i]
        p.v[i] = (x * ca + z * sa, y, -x * sa + z * ca)
    lo = min(v[2] for v in p.v)
    for i in range(len(p.v)):
        x, y, z = p.v[i]
        p.v[i] = (x, y, z + rest - lo)
    return p


# ── pu_base — the issue plate. Corporate, milled, identical under all five. ──────────────────────

def build_base():
    """Eight dashes on a circle: a supply bay stamped into the floor.

    ⚠ kit.Part.cyl is ALWAYS CAPPED — kit.py says so in as many words, and reaching for it to make
      a ring roofs the bay over as a solid drum, which is the exact geometry this was demoted from.
      Ring segments are boxes round the radius, which is what kit.py tells you to do.
    Long dashes on the diagonals, short between: the long ones are index marks, so the bay has an
    orientation. Precise, regular, cold — the only part of the set allowed to be any of those."""
    p = kit.Part('pu_base')
    for k in range(8):
        a = k * TAU / 8 + math.pi / 8
        long_mark = (k % 2 == 0)
        p.box((math.cos(a) * PLATE_R, math.sin(a) * PLATE_R, PLATE_TOP / 2.0),
              (0.066 if long_mark else 0.034, 0.015, PLATE_TOP), a + math.pi / 2)
    return p


# ── pu_rush — THE TOP. Widest low, point down, barbed. Winds down and topples. ──────────────────

def build_rush():
    """A prize-machine spinning top: the cartoon object whose ONLY property is that it spins fast
    and slows down. Solid of revolution, so it is legible from every bearing — which the flat
    chevron/bolt shapes it was drafted as are not (a flat plate is a bar edge-on, and a pickup is
    walked around).

    ⚠ IT IS A SPINDLE, NOT A DOME, AND THE MEASUREMENT CHOSE THAT. Drafted squat (0.24 tall ×
      0.34 wide) it was the last pair left failing, at 0.756 against the lying HOURGLASS — end-on
      the lying glass is a 0.22 disc and a squat 0.34 cone CONTAINS it, which is the identical
      structural failure the hourglass was itself moved out of. Fixed by ASPECT rather than by
      detail: 0.33 tall × 0.25 wide, so the only ground-hugging mass in the set belongs to the one
      item that is lying down. Every other pair had 0.2–0.3 of headroom, which is what made the
      top the cheap one to move rather than the glass."""
    p = kit.Part('pu_rush')
    z = PLATE_TOP + 0.002
    lathe(p, z, z + 0.036, 0.005, 0.028, seg=10)                       # the point it spins on
    lathe(p, z + 0.036, z + 0.092, 0.030, 0.110, seg=10)               # barb 1 — the widest
    # ⚑ barbs 2 and 3 are OFF AXIS. This is decision 1c and it is also why the top wobbles as it
    #   slows: the misregistration and the motion are the same fact, not two effects.
    lathe(p, z + 0.092, z + 0.140, 0.048, 0.088, seg=10, dx=0.006, dy=-0.004)
    lathe(p, z + 0.140, z + 0.182, 0.036, 0.070, seg=10, dx=-0.005, dy=0.007)
    lathe(p, z + 0.182, z + 0.276, 0.024, 0.024, seg=10)               # stem
    lathe(p, z + 0.276, z + 0.330, 0.032, 0.008, seg=10)               # finial to flick
    return p


# ── pu_hover — THE LENS. The only item with floor visible underneath it. ────────────────────────

def build_hover():
    """A saucer holding station over its own empty plate. Wide, low and ROUND in plan, which is
    what separates it from the wing (wide, but swept and carried high on a stem).

    ⚑ The 0.15 m gap is authored into the mesh, not applied by the game: the placement code puts
    every item's origin on the floor, and this one is simply modelled starting higher. One less
    number for a game to get wrong, and it means the hover reads correctly in any viewer."""
    p = kit.Part('pu_hover')
    z = PLATE_TOP + GAP
    lathe(p, z, z + 0.056, 0.058, 0.182, seg=12)                       # lower skirt
    lathe(p, z + 0.056, z + 0.074, 0.182, 0.182, seg=12)               # girdle — the chamfer band
    lathe(p, z + 0.074, z + 0.126, 0.178, 0.070, seg=12, dx=0.009)     # dome, off register
    lathe(p, z + 0.126, z + 0.142, 0.070, 0.052, seg=12, dx=0.009)     # cap
    for k in range(3):                                                 # thruster vents, hand-cut
        a = k * TAU / 3 + 0.4
        p.box((math.cos(a) * 0.176, math.sin(a) * 0.176, z + 0.065), (0.034, 0.014, 0.014), a)
    return p


# ── pu_flight — THE WING. Mass at the TOP, on a thin stem: a Y. ──────────────────────────────────

def build_flight():
    """A winged upright — deliberately NOT a flat wing lying on the plate. A lying wing is wide and
    low, which is the saucer's silhouette; raising it onto a stem inverts the mass distribution
    (narrow below, wide above) and makes the pair unmistakable at 16 px.

    ⛔ THREE BLADES, NOT ONE PAIR, AND THE TEST IS WHY. Drafted as two wings at ±y, this scored
       0.709 against the BOOT at 16 px — because a wing seen edge-on is a LINE, so from two of the
       twelve bearings the whole item collapsed to a bare stem and matched a boot shank exactly.
       ⚑ That is the defect the per-bearing measurement exists to catch and the one a single-view
       test (npm run test:guns) cannot see at all: the item was distinctive from ten bearings out
       of twelve, which in play means it is unrecognisable from a sixth of the arena. Three blades
       at 120° have no degenerate bearing — every view shows one blade broadside and two
       foreshortened, so the splay is always there.

    Three FEATHERS per blade rather than one lofted wing, each starting a little further aft than
    the last, so the trailing edge is STEPPED — hand-cut, misregistered, the opposite of a smooth
    taper. kit.foil is a real chord/thickness taper, so the surface has something for the draught
    to act on when it rocks (§3)."""
    p = kit.Part('pu_flight')
    lathe(p, PLATE_TOP, 0.196, 0.032, 0.024, seg=8)                    # stem
    lathe(p, 0.190, 0.234, 0.052, 0.044, seg=8)                        # hub the blades root into
    # (root, tip, chord_root, chord_tip, thick_root, thick_tip, sweep) — rising as it spans
    FEATHERS = [
        ((0.000, 0.036, 0.216), (0.000, 0.104, 0.262), 0.118, 0.078, 0.022, 0.013, -0.018),
        ((-0.011, 0.090, 0.254), (-0.011, 0.155, 0.310), 0.094, 0.060, 0.017, 0.010, -0.024),
        ((-0.024, 0.140, 0.302), (-0.024, 0.190, 0.360), 0.074, 0.040, 0.013, 0.008, -0.028),
    ]
    for k in range(3):
        ang = k * TAU / 3 + 0.18
        for (rt, tp, cr, ct, tr, tt, sw) in FEATHERS:
            kit.foil(p, rt, tp, cr, ct, tr, tt, sweep=sw)
            spin_last(p, 8, ang)
        # leading-edge strip, PROUD of the feathers so the rim light catches a cut rather than a
        # painted line — build-craft.py's finding: a foil strip thinner than what it dresses is a
        # stamp you cannot see.
        kit.foil(p, (0.066, 0.036, 0.216), (0.048, 0.190, 0.360), 0.020, 0.013, 0.030, 0.012)
        spin_last(p, 8, ang)
    return p


# ── pu_spring — THE BOOT. An L on a striped stack. ────────────────────────────────────────────────

def build_spring():
    """ONE boot, big, on a coil spring. A pair doubles the triangles and thickens the silhouette
    into a block; one exaggerated boot is the cartoon read and it is what the artist's own cards
    do (oversized oval shoes, giant gloves, heavy outline, nothing else in frame).

    The spring is THREE flat coils with real gaps rather than a fine helix: at 16 px a fine helix
    is a grey cylinder, whereas three gaps are three gaps. The staggered connector posts are what
    make the stack read as one helix instead of three plates — and the whole sole compresses
    legibly under a single Y-scale, which is how §3's load-and-fire is driven with one transform.

    ⚠ WIDE SOLE, NARROW CUFF, and that is a MEASURED shape, not a styling choice. Drafted with a
      flared cuff it scored 0.781 against the HOURGLASS at 16 px: seen along the toe axis a boot
      loses its L entirely and becomes a tall block, and a tall block with mass at both ends is an
      hourglass. Widening the sole to 0.235 and shrinking the cuff to 0.126 makes the taper 1.9:1
      bottom-heavy, which is the one thing a symmetric bowtie can never be."""
    p = kit.Part('pu_spring')
    z = PLATE_TOP + 0.004
    # ⚑ the spring sits OFF-CENTRE, under the heel where the load actually is (decision 1c, and
    #   the reason the boot leans forward when it fires rather than hopping straight up)
    # ⚑ THE GAPS ARE THE READ, so they are sized in COARSE CELLS, not by eye: at 25 m one cell of
    #   the 16 px frame is 32 mm, so a 13 mm gap is a third of a cell and disappears. 33 mm gaps
    #   survive, and a striped base is something no other item in the set has.
    lathe(p, z, z + 0.016, 0.070, 0.070, seg=8, dx=-0.014)
    lathe(p, z + 0.059, z + 0.075, 0.068, 0.068, seg=8, dx=-0.010)
    lathe(p, z + 0.118, z + 0.134, 0.066, 0.066, seg=8, dx=-0.019)
    # ⚠ the connectors are the helix, and a helix that closed both gaps would undo the stripe. Two
    #   thin posts on opposite sides, staggered, so no bearing ever sees both gaps bridged.
    p.box((0.044, 0.008, z + 0.038), (0.014, 0.014, 0.058))
    p.box((-0.062, -0.012, z + 0.097), (0.014, 0.014, 0.058))
    zs = z + 0.134
    p.box((0.042, 0.0, zs + 0.013), (0.268, 0.196, 0.026))             # sole — the wide flat read
    p.box((0.050, 0.0, zs + 0.062), (0.238, 0.166, 0.072))             # foot
    p.box((0.158, 0.0, zs + 0.070), (0.086, 0.142, 0.062))             # toe box
    p.box((0.196, 0.0, zs + 0.092), (0.048, 0.118, 0.044))             # upturned toe tip
    p.box((-0.020, 0.0, zs + 0.126), (0.122, 0.128, 0.076))            # ankle
    p.box((0.014, 0.0, zs + 0.134), (0.150, 0.140, 0.022))             # instep strap — a die-cut
    p.box((-0.028, 0.0, zs + 0.230), (0.104, 0.104, 0.132))            # shank, deliberately thin
    p.box((0.028, 0.0, zs + 0.300), (0.050, 0.082, 0.078))             # tongue, flapping forward
    p.box((-0.032, 0.0, zs + 0.312), (0.116, 0.108, 0.038))            # cuff — small, NOT flared
    return p


# ── pu_slip — THE GLASS. Pinched. The only object in the arena on a different clock. ───────────

def build_slip():
    """An hourglass, TIPPED OVER — the one object whose whole meaning is time, readable from every
    bearing because it is a solid of revolution, and unmistakable at 16 px because the waist is a
    genuine pinch rather than a taper.

    ⛔ IT LIES DOWN, AND THAT IS A MEASURED FIX AS WELL AS THE BEST IDEA IN THE SET. Standing
       upright it scored 0.737 against the BOOT at 16 px, and the reason is structural rather than
       stylistic: an upright hourglass is entirely CONTAINED inside an upright boot's outline, so
       the intersection is the whole hourglass and the IoU is just the ratio of their areas. No
       amount of detail on either object can fix a containment — only a change of pose can.
    ⚠ A HALF-MEASURE MADE IT WORSE. Leaned at 38° it went to 0.748, because tipping an object
      whose width and height are similar GROWS its bounding box (h·cos + w·sin) — it became taller
      and wider and overlapped the boot more. Lying at 78° the bowtie's axis is horizontal, which
      is a silhouette no upright object in the set can produce at any bearing.
    ⚑ And a timer laid over is not a compromise, it is the ITEM: sand does not fall sideways, so an
       hourglass on its side has STOPPED, and stopped time is exactly what slow-mo is. 78° rather
       than 90° so it rests crooked on its frame rails — the artist's register, and a cradle that
       gives §3's wrong-time-base rock something physical to rock on.

    ⚠ The two bells are misregistered against each other by 5 mm — the give-away that this was
    struck in two halves in a cheap die, and the reason it does not read as a lathe.

    ⚠ The waist is 0.044 across against 0.220 at the bells — a 5:1 pinch, deliberately extreme.
      A gentle waist is a taper, and a taper at 16 px is a cylinder."""
    p = kit.Part('pu_slip')
    z = PLATE_TOP + 0.002
    lathe(p, z, z + 0.026, 0.138, 0.134, seg=10)                       # foot
    lathe(p, z + 0.026, z + 0.126, 0.130, 0.028, seg=10)               # lower bell
    lathe(p, z + 0.126, z + 0.150, 0.028, 0.028, seg=10)               # the waist
    lathe(p, z + 0.150, z + 0.250, 0.028, 0.130, seg=10, dx=0.005)     # upper bell, off register
    lathe(p, z + 0.250, z + 0.276, 0.134, 0.138, seg=10, dx=0.005)     # head
    for k in range(3):                                                 # frame rails
        spoke(p, k * TAU / 3 + 0.25, 0.138, z + 0.018, z + 0.260, 0.022, 0.022)
    return tip_over(p, math.radians(84.0), PLATE_TOP)


# ════════════════════════════════════════════════════════════════════════════════════════════════
# THE ACCEPTANCE MEASUREMENT — see brief §5. Runs before the export and can veto it.
# ════════════════════════════════════════════════════════════════════════════════════════════════

BEARINGS = 12                    # every 30° around the item — a pickup is walked around
FINE = 128                       # px, the master raster every view is downsampled from
COVER = 0.30                     # a cell lights when 30% of its fine cells are filled
WIN_X = (-0.26, 0.26)            # the common world-space window, in metres. NOT per-item
WIN_Y = (-0.03, 0.49)            #   normalised: nothing rescales a pickup, so size counts.

# ⛔ DEPRESSION AND PIXEL SIZE ARE THE SAME VARIABLE, AND THE FIRST VERSION OF THIS HARNESS GOT
#    THAT WRONG. It crossed two depressions with one 16 px raster and reported its worst score at
#    "20° depression, 16 px". That view CANNOT EXIST: you are only looking 20° down at a floor
#    object when you are 4.5 m from it, and at 4.5 m it is 116 px tall, not 16. The harness was
#    inventing its own worst case — a squashed, low-resolution blob nobody ever sees — and the
#    geometry was being tuned against it. ⚑ Both quantities follow from ONE number, the distance,
#    so the views below are DERIVED from it: depression from the eye height, pixel size from the
#    vertical fov. Three ranges: across the arena, mid-room, and standing over it.
EYE = 1.62                       # js/s9pc-game.js's operative eye height, in metres
ITEM_MID = 0.20                  # roughly the middle of a prize, where the eye lands
FOV_V = 0.97                     # js/s9pc-app.js's vertical fov, radians — the same number
SCREEN_H = 1080
WIN_H = WIN_Y[1] - WIN_Y[0]


def view_at(d):
    """(label, depression rad, raster px) for a pickup `d` metres away. Nothing asserted."""
    return ('%2dm' % d,
            math.atan2(EYE - ITEM_MID, d),
            max(8, int(round(WIN_H / d / FOV_V * SCREEN_H))))


VIEWS = [view_at(d) for d in (25, 12, 5)]
# Gates. ⚑ The FAR view is the one the requirement is about ("readable at a glance and from
# distance"), so it carries the tightest numbers; the near view is generous because at 5 m you
# also have colour, the die-line, a HUD prompt and a name. WORST is "there exists a bearing where
# these two are confusable"; MEDIAN is "how confusable from a typical approach" — a max over 36
# samples reported alone cannot tell a single bad angle from being alike everywhere.
GATE = {'25m': (0.62, 0.46), '12m': (0.62, 0.46), ' 5m': (0.70, 0.52)}

# ── BUDGET, stated up front and enforced below ──────────────────────────────────────────────────
# Context, not a guess: models/weapons/s9-guns.glb is 1,092 tris / 58 KB for four weapons that are
# on screen constantly and up to 116 px tall in a viewmodel. A pickup is smaller than a gun in
# every frame it appears in and there are at most four in an arena (js/s9pc-game.js caps G.pows at
# 4), so the whole set has to fit inside roughly one gun file. Flat facets are the ink (decision
# 1a), so the budget and the look pull the same way for once.
TRIS_PER_PART = 260
TRIS_TOTAL = 1400
BYTES_MAX = 66 * 1024


def tris_of(part):
    """Fan-triangulate the Part's faces. kit caps are convex ngons, so a fan is exact."""
    out = []
    for f in part.f:
        for k in range(1, len(f) - 1):
            out.append((part.v[f[0]], part.v[f[k]], part.v[f[k + 1]]))
    return out


def raster(tris, theta, phi, w, h):
    """Orthographic silhouette from bearing `theta`, looking DOWN by `phi`, into a w×h bitmap.

    Orthographic on purpose: the read being tested is the shape, and a perspective projection at
    25 m differs from an orthographic one by less than one coarse cell while adding a distance
    parameter that would then have to be defended.
    """
    ct, st = math.cos(theta), math.sin(theta)
    cp, sp = math.cos(phi), math.sin(phi)
    rx, ry, rz = st, -ct, 0.0                       # screen right  = normalize(fwd × up)
    ux, uy, uz = ct * sp, st * sp, cp               # screen up     = right × fwd
    x0, x1 = WIN_X
    y0, y1 = WIN_Y
    grid = bytearray(w * h)

    def proj(p):
        sx = p[0] * rx + p[1] * ry + p[2] * rz
        sy = p[0] * ux + p[1] * uy + p[2] * uz
        return ((sx - x0) / (x1 - x0) * (w - 1), (h - 1) - (sy - y0) / (y1 - y0) * (h - 1))

    for (a, b, c) in tris:
        (ax, ay), (bx, by), (cx, cy) = proj(a), proj(b), proj(c)
        lo = max(0, int(math.floor(min(ay, by, cy))))
        hi = min(h - 1, int(math.ceil(max(ay, by, cy))))
        for y in range(lo, hi + 1):
            xs = []
            for (px, py, qx, qy) in ((ax, ay, bx, by), (bx, by, cx, cy), (cx, cy, ax, ay)):
                if (py <= y < qy) or (qy <= y < py):
                    xs.append(px + (y - py) / (qy - py) * (qx - px))
            if len(xs) < 2:
                continue
            xs.sort()
            xa = max(0, int(math.floor(xs[0])))
            xb = min(w - 1, int(math.ceil(xs[-1])))
            for x in range(xa, xb + 1):
                grid[y * w + x] = 1
    return grid


def downsample(grid, w, h, n, ox=0, oy=0):
    """Fine → n×n with a coverage threshold, sampled at a sub-cell PHASE (ox, oy) in fine pixels.

    ⚑ This is the step that bites: at 23 px a thin wingtip covers a fraction of a cell and
    DISAPPEARS, exactly as it does on a real screen across an arena. A difference that survives
    only at 128 px is a difference the player does not have.
    ⚠ AND IT IS WHY THE PHASE ARGUMENT EXISTS. At 22–23 px the result depends on where the object
      happens to land on the pixel grid: widening the measurement window by 4% (23 px → 22 px)
      moved one pair's median by 0.058, which is larger than the margin being argued about. Tuning
      geometry against that number would be tuning against the raster, not against the design. A
      pickup has no fixed alignment to the screen grid, so the honest statistic is the MEAN over
      phases — which is what a player actually gets, averaged over where they happen to stand.
    """
    out = bytearray(n * n)
    bw, bh = w / float(n), h / float(n)
    need = bw * bh * COVER
    for cy in range(n):
        for cx in range(n):
            s = 0
            for y in range(max(0, int(cy * bh + oy)), min(h, int((cy + 1) * bh + oy) + 1)):
                row = y * w
                for x in range(max(0, int(cx * bw + ox)), min(w, int((cx + 1) * bw + ox) + 1)):
                    s += grid[row + x]
            if s >= need:
                out[cy * n + cx] = 1
    return out


def iou(a, b):
    inter = uni = 0
    for i in range(len(a)):
        if a[i] and b[i]:
            inter += 1
        if a[i] or b[i]:
            uni += 1
    return (inter / float(uni)) if uni else 1.0


def measure(items, base_tris, with_base):
    """{view: [(a, b, worst, median, worst-bearing)]} — every pair, every bearing, every range.

    Each (view, bearing) IoU is the mean over four sub-cell phases; see downsample()."""
    keys = [k for (k, _) in items]
    shots = {}
    for (k, part) in items:
        tris = tris_of(part) + (base_tris if with_base else [])
        per_view = {}
        for (label, phi, px) in VIEWS:
            half = FINE / float(px) / 2.0
            per_view[label] = []
            for b in range(BEARINGS):
                g = raster(tris, b * TAU / BEARINGS, phi, FINE, FINE)
                per_view[label].append([downsample(g, FINE, FINE, px, ox, oy)
                                        for (ox, oy) in ((0, 0), (half, 0), (0, half), (half, half))])
        shots[k] = per_view
    out = {}
    for (label, _phi, _px) in VIEWS:
        rows = []
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                a, b = shots[keys[i]][label], shots[keys[j]][label]
                s = [sum(iou(a[n][ph], b[n][ph]) for ph in range(4)) / 4.0
                     for n in range(BEARINGS)]
                w = max(s)
                # ⚑ WORST *AND* MEDIAN. The worst says "there is a bearing where these two are
                # confusable"; the median says "how confusable from a typical approach". One bad
                # angle in twelve is a different defect from being alike everywhere, and a max
                # reported alone cannot tell them apart.
                rows.append((keys[i], keys[j], w, sorted(s)[len(s) // 2],
                             s.index(w) * 360 // BEARINGS))
        out[label] = rows
    return out


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[0] if argv else 'models/pickups.glb'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)

    kit.reset()
    base = build_base()
    items = [('rush', build_rush()), ('hover', build_hover()), ('flight', build_flight()),
             ('spring', build_spring()), ('slip', build_slip())]

    base_tris = tris_of(base)
    print('PLATE   pu_base       verts=%4d tris=%4d' % (len(base.v), len(base_tris)))
    total = len(base_tris)
    for (k, part) in items:
        tris = tris_of(part)
        total += len(tris)
        xs = [v[0] for v in part.v]
        ys = [v[1] for v in part.v]
        zs = [v[2] for v in part.v]
        print('  PART  %-13s verts=%4d tris=%4d  W=%.3f D=%.3f  top=%.3f  floor gap=%.3f'
              % (part.name, len(part.v), len(tris),
                 max(xs) - min(xs), max(ys) - min(ys), max(zs), min(zs) - PLATE_TOP))

    print('\n  VIEWS (derived from eye %.2f m · fov %.2f rad · %d px tall screen):' % (EYE, FOV_V, SCREEN_H))
    for (label, phi, px) in VIEWS:
        print('    %s  depression %4.1f°   item frame %3d px' % (label, math.degrees(phi), px))

    fails = []
    for (title, wb) in (('PRIZE ONLY — the discriminating half', False),
                        ('PRIZE + PLATE — what is actually on screen', True)):
        res = measure(items, base_tris, wb)
        print('\n  IoU · %s · %d bearings per view' % (title, BEARINGS))
        print('    %-19s' % '' + ''.join('   %s worst  med ' % lb for (lb, _, _) in VIEWS))
        rows = {}
        for (lb, _, _) in VIEWS:
            for r in res[lb]:
                rows.setdefault((r[0], r[1]), {})[lb] = r
        order = sorted(rows, key=lambda k: -rows[k][VIEWS[0][0]][2])
        for key in order:
            line = '    %-7s vs %-7s' % key
            for (lb, _, _) in VIEWS:
                r = rows[key][lb]
                line += '    %.3f  %.3f' % (r[2], r[3])
            print(line + '   worst bearing %d°' % rows[key][VIEWS[0][0]][4])
        if not wb:
            continue
        for (lb, _, _) in VIEWS:
            w = max(r[2] for r in res[lb])
            m = max(r[3] for r in res[lb])
            gw, gm = GATE[lb]
            wp = max(res[lb], key=lambda r: r[2])
            print('    %s  WORST PAIR %s/%s  worst %.3f (max %.2f) · median %.3f (max %.2f)'
                  % (lb, wp[0], wp[1], w, gw, m, gm))
            if w > gw:
                fails.append('%s worst %.3f > %.2f (%s/%s)' % (lb, w, gw, wp[0], wp[1]))
            if m > gm:
                fails.append('%s median %.3f > %.2f' % (lb, m, gm))
    print('    (five billboards score 1.000 in every cell of that table — that is the baseline)')
    if fails:
        raise SystemExit('PICKUPS_FAIL silhouettes too alike — REFUSING TO WRITE %s\n           %s'
                         % (out, '\n           '.join(fails)))

    base.emit()
    for (_, part) in items:
        if part.emit() is None:
            raise SystemExit('EMPTY PART ' + part.name)
    kit.export_glb(out)
    size = os.path.getsize(out)
    over = ['%s %d tris > %d' % (p2.name, len(tris_of(p2)), TRIS_PER_PART)
            for (_, p2) in items + [('base', base)] if len(tris_of(p2)) > TRIS_PER_PART]
    if total > TRIS_TOTAL:
        over.append('total %d tris > %d' % (total, TRIS_TOTAL))
    if size > BYTES_MAX:
        over.append('%d bytes > %d' % (size, BYTES_MAX))
    if over:
        os.remove(out)
        raise SystemExit('PICKUPS_FAIL over budget — REMOVED %s\n           %s'
                         % (out, '\n           '.join(over)))
    print('PICKUPS_OK glb=%s parts=%d tris=%d/%d  %d/%d bytes  (worst part %d/%d tris)'
          % (out, 1 + len(items), total, TRIS_TOTAL, size, BYTES_MAX,
             max(len(tris_of(p2)) for (_, p2) in items), TRIS_PER_PART))


main()

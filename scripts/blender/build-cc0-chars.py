# upperdeckripmaster3030 — CC0-lineage fighter bodies, authored in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-cc0-chars.py -- models/cc0
#   (or just: npm run cc0)
#
# Writes one GLB per body:
#   cc0-lank.glb · cc0-squat.glb · cc0-lump.glb          (the first set)
#   rip-mascot.glb · cc0-mosh.glb · cc0-cel.glb · cc0-grid.glb   (task #85)
#
# SILHOUETTE-FIRST, AND THAT IS NOT A SLOGAN — IT IS THE ONLY DEGREE OF FREEDOM THERE IS.
# NEON RONIN's fighters are driven by an IK skeleton whose joint positions are fixed, and
# js/ronin3d.js's rigid-part rig moves each part by how far ITS joint travelled. So a body cannot
# change where its elbow is. What it can change is the VOLUME hung on each joint — and that turns
# out to be enough, because at play distance a fighter is a silhouette and nothing else.
#
# Three bodies, one skeleton, one builder, three parameter sets. If you want a fourth, add a dict.
#
# ── WHAT WAS AND WAS NOT TAKEN ────────────────────────────────────────────────────────────────
# These are PROPORTION STUDIES against VERIFIED CC0 sources (see docs/CC0-SOURCES.md), not
# characters from them. What crosses over is the ratio — "the limbs are far too long for the
# head", "the mass is low and the feet are enormous", "nothing is symmetrical". What does not
# cross over is any feature that identifies anybody: no faces are modelled at all, there are no
# eyes, no mouths, no hats, no traits, no markings. A face is where a character lives, and
# ronin3d draws its own expressive face over a body anyway.
#
#   lank   ← mfers (sartoshi) ...... hand-drawn slouch: small head, thin limbs, oversized feet
#   squat  ← CrypToadz (GREMPLIN) .. low centre of mass, wide flat head, heavy splayed feet
#   lump   ← goblintown ............ committed asymmetry: one shoulder carries, the other doesn't
#   mascot ← THE ARTIST'S OWN ...... cereal-box / arcade mascot: big head, hose limbs, big shoes
#   mosh   ← XCOPY ................. quantised slice-offset: the figure as a badly-decoded frame
#   cel    ← Darkfarms (SMOWLz) .... flat facets held by a heavy keyline, "smol" mass ratio
#   grid   ← Nouns ................. every vertex on a 1/32 lattice, strictly symmetrical
#
# ── SECOND SET (task #85): THE SILHOUETTE RULE IS NOW A GEOMETRY OPERATOR ─────────────────────
# The first three bodies differ only in the NUMBERS below, which is honest but limited: a
# proportion study can say "the head is bigger", it cannot say "the artist's move is that the
# image is mis-registered". So this file gained three optional operators, each of which IS a
# construction rule taken from a source, applied to the finished vertices of a part:
#
#   tear=  quantised horizontal slice-offset .. XCOPY. Cf. prop_slice in build-cc0-props.py:
#          bands, a MINORITY of them shifted sideways by a quantised amount. The intermittence
#          is the signature — a uniform shear is a skew, and a skew reads as a mistake.
#          Hashed on the BAND INDEX ALONE, with no per-part salt, so one tear cuts across the
#          whole figure at one height. A per-part salt would make each limb wrong on its own,
#          which is noise; a slice through everything at once is datamosh.
#   key=   a raised belt at every mass's equator .. Darkfarms. 21.4% of every SMOWLz token is
#          pure-black keyline around a flat fill. Flat fills need an EDGE to read; in 2-D that is
#          a stroke, and the 3-D equivalent of a stroke is a ridge that catches the key light.
#   quant= snap every vertex to a lattice .... Nouns. The 2-D rule is that a pixel is on or off;
#          in three axes that is a vertex on a lattice point or not at all. 1/32 exactly, so the
#          sole (0) and the crown (1.0) are both ON the lattice and the height contract survives.
#
# ⛔ WHAT IS STILL NOT TAKEN, and it has not moved: no figure, no character, no face, no trait,
# no mark, no wordmark, no name. `tear` is a construction rule, not an XCOPY composition; `key`
# is a stroke, not an owl; `quant` is a lattice, and there are NO NOGGLES anywhere in this file.
# CC0 waives copyright and never trademark — see docs/CC0-SOURCES.md, "Two things CC0 does not do".
#
# ⚑ `rip-mascot` IS NOT A CC0 BODY AT ALL, and its name says so. Its lineage is the artist's own
# Fake Rares / Rare Pepe card practice — graded **ATTESTED, in scope** in docs/CC0-SOURCES.md
# ("the artist's own submissions outright", "the natural first source for in-game art"). It is the
# one body in this directory that needs nobody's permission, which is why it leads the set.
# ⛔ AND THERE IS NO PEPE IN IT. Nothing amphibian is modelled — no frog, no snout, no lids. The
# dossier's carve-out is explicit (the underlying character is Matt Furie's and is enforced) and
# it is respected literally rather than approximately. What crosses over is the artist's own
# stated lineage — MAD magazine and cereal boxes, then the arcade — as a MASCOT PROPORTION:
# an enormous head, rubber-hose limbs of constant radius, mitts and shoes far too big for it.
#
# ── THE PART-NAME TRAP, MEASURED NOT ASSUMED ─────────────────────────────────────────────────
# js/ronin3d.js's JOINTMAP is an ORDERED regex list, and the front-arm rule is
#     /(arm|shoulder|bicep).*(f|front|r|right).*(up|upper)?/  →  armF0
# The `(f|front|r|right)` alternation matches a bare `r`, and both "upper" and "lower" contain
# one. So the names models/README.md documents do NOT land where it says:
#
#     arm_f_upper → armF0 ✓      arm_f_lower → armF0 ✗ (wanted armF1)
#     arm_b_upper → armF0 ✗      arm_b_lower → armF0 ✗ (wanted armB0 / armB1)
#
# Three of the four arm names collapse onto the FRONT SHOULDER — a model authored to the README
# would fight with both forearms and its back upper arm welded to one shoulder. That is not this
# file's to fix (ronin3d.js and models/README.md are owned elsewhere), so this file routes round
# it with names that were verified against the actual JOINTMAP:
#
#     shoulder_f/elbow_f/hand_f · shoulder_b/elbow_b/hand_b
#     thigh_f/shin_f/foot_f     · thigh_b/shin_b/foot_b     · head/chest/pelvis
#
# Do not "tidy" these to match the README until the README is right.
#
# ── frame ────────────────────────────────────────────────────────────────────────────────────
# Blender Z-up (kit.py's level frame); export_glb() converts to the glTF Y-up ronin-glb reads.
#   +x = the fight line. armF/legF are the FRONT (toward the opponent) side, armB/legB the back.
#   +z = height. The body is authored EXACTLY 1.0 tall with the soles at z=0 and the crown at
#        z=1.0, because registerModel() normalises on total height and then places every part at
#        its skeleton joint — if a horn poked above 1.0, every joint below it would shift.
#   +y = depth, and it is small: this is a 2.5-D duel, not a brawler.

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                                       # noqa: E402
import kit                                                                       # noqa: E402

TAU = math.pi * 2

# The skeleton, in normalised height. Lifted from js/ronin3d.js's own BIND/BINDC tables (the
# `skinPalette` bind pose) rather than eyeballed — those numbers ARE the rest pose the rig
# computes, so a part authored here sits exactly on the joint that will move it.
J = {
    'pelvis':     (0.00, 0.50), 'chest': (0.00, 0.62), 'head': (0.00, 0.84),
    'shoulder_f': (0.10, 0.80), 'elbow_f': (0.26, 0.79), 'hand_f': (0.40, 0.78),
    'shoulder_b': (-0.10, 0.80), 'elbow_b': (-0.26, 0.79), 'hand_b': (-0.40, 0.78),
    'thigh_f':    (0.07, 0.48), 'shin_f': (0.07, 0.26), 'foot_f': (0.07, 0.04),
    'thigh_b':    (-0.07, 0.48), 'shin_b': (-0.07, 0.26), 'foot_b': (-0.07, 0.04),
}


# ── local primitives ─────────────────────────────────────────────────────────────────────────
# kit.py is shared and read-only for this job. kit.cyl() only stands on Z and kit.foil() only
# lofts flat surfaces, so neither can make a limb running from a shoulder to an elbow. These two
# live here because so far only this file needs them; promoting a one-caller helper into the
# shared kit is how a kit turns into a junk drawer.

def limb(part, a, b, r0, r1, seg=8, squash=1.0):
    """Tapered tube from 3-D point `a` to `b`. `squash` flattens it across the fight line, which
    is what makes a limb read as a limb rather than as a pipe when seen edge-on."""
    ax, ay, az = a
    bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az
    L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    d = (dx / L, dy / L, dz / L)
    # any vector not parallel to d, to start the frame from
    up = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
    u = (d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0])
    ul = math.sqrt(sum(c * c for c in u)) or 1e-6
    u = (u[0] / ul, u[1] / ul, u[2] / ul)
    v = (d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0])
    base = len(part.v)
    for (c, r) in ((a, r0), (b, r1)):
        for i in range(seg):
            t = TAU * i / seg
            cu, sv = math.cos(t) * r * squash, math.sin(t) * r
            part.v.append((c[0] + u[0] * cu + v[0] * sv,
                           c[1] + u[1] * cu + v[1] * sv,
                           c[2] + u[2] * cu + v[2] * sv))
    for i in range(seg):
        j = (i + 1) % seg
        part.f.append((base + i, base + j, base + seg + j, base + seg + i))
    part.f.append(tuple(base + i for i in range(seg - 1, -1, -1)))
    part.f.append(tuple(base + seg + i for i in range(seg)))
    return part


def blob(part, c, r, seg=10, rings=6, jitter=None, inward=False):
    """UV ellipsoid. `jitter` (a random.Random) roughens the radius per vertex — the difference
    between a lumpen body and a stack of eggs.

    `inward` makes the jitter one-sided, so no vertex can exceed the nominal radius. Use it on
    any blob that defines an extreme of the model. The lump body caught this the honest way: the
    crown came out at z=1.001325 and scripts/build-cc0.mjs's bounds assertion failed the build,
    because a body 0.13% too tall silently shifts every joint off its part. Two-sided jitter on
    the shape that IS the top of the model is a contradiction; this resolves it.
    """
    base = len(part.v)
    part.v.append((c[0], c[1], c[2] + r[2]))
    for i in range(1, rings):
        phi = math.pi * i / rings
        sp, cp = math.sin(phi), math.cos(phi)
        for j in range(seg):
            th = TAU * j / seg
            if jitter is None:
                k = 1.0
            elif inward:
                k = 1.0 - jitter.random() * 0.16
            else:
                k = 1.0 + jitter.uniform(-0.13, 0.13)
            part.v.append((c[0] + math.cos(th) * sp * r[0] * k,
                           c[1] + math.sin(th) * sp * r[1] * k,
                           c[2] + cp * r[2] * k))
    part.v.append((c[0], c[1], c[2] - r[2]))
    south = len(part.v) - 1
    for j in range(seg):
        part.f.append((base, base + 1 + (j + 1) % seg, base + 1 + j))
    for i in range(rings - 2):
        a = base + 1 + i * seg
        b = a + seg
        for j in range(seg):
            j2 = (j + 1) % seg
            part.f.append((a + j, a + j2, b + j2, b + j))
    last = base + 1 + (rings - 2) * seg
    for j in range(seg):
        part.f.append((south, last + j, last + (j + 1) % seg))
    return part


def belt(part, c, r, k=1.12, t=0.024, seg=10):
    """A raised elliptical belt at a mass's equator — the Darkfarms KEYLINE, in relief.

    Closed on purpose (side quads plus two caps). The caps sit inside the blob it rings, so they
    are never seen, and being watertight means it cannot flip inside-out under a renderer that
    culls back faces. An open band would have been three fewer triangles and one more thing that
    only breaks in one of the two games.
    """
    rx, ry = r[0] * k, r[1] * k
    base = len(part.v)
    for dz in (-t / 2.0, t / 2.0):
        for i in range(seg):
            a = TAU * i / seg
            part.v.append((c[0] + math.cos(a) * rx, c[1] + math.sin(a) * ry, c[2] + dz))
    for i in range(seg):
        j = (i + 1) % seg
        part.f.append((base + i, base + j, base + seg + j, base + seg + i))
    part.f.append(tuple(base + i for i in range(seg - 1, -1, -1)))
    part.f.append(tuple(base + seg + i for i in range(seg)))
    return part


def _bandhash(b):
    """Deterministic 0..1 from a band index. Python's own hash() is salted per process, so a
    body built today and rebuilt tomorrow would tear in different places — which would make the
    asset unreproducible for exactly the reason models/README.md now has a section about."""
    x = (b * 374761393 + 668265263) & 0xFFFFFFFF
    x ^= x >> 13
    x = (x * 1274126177) & 0xFFFFFFFF
    x ^= x >> 16
    return x / 4294967296.0


def tear(part, band=0.044, amt=0.034, prob=0.40, step=0.0085):
    """XCOPY's slice-offset, as geometry: cut the part into horizontal bands and shift a MINORITY
    of them sideways by a QUANTISED amount.

    x only — z is untouched, which is what keeps the sole-at-0 / crown-at-1 contract intact no
    matter how hard this is pushed. Quantised because a datamosh is a block copied from the wrong
    ADDRESS: the offset is a whole number of somethings, never a smooth slide.
    """
    out = []
    for (x, y, z) in part.v:
        h = _bandhash(int(math.floor(z / band)))
        if h < prob:
            n = int(round((h / prob * 2.0 - 1.0) * amt / step))
            x += n * step
        out.append((x, y, z))
    part.v = out
    return part


def quantise(part, g):
    """Nouns' strict grid pushed into a third axis: every vertex lands on a lattice point.

    ⚠ `g` MUST divide 1.0 exactly (1/32 here). The sole is at z=0 and the crown at z=1.0, and
    both are lattice points under 1/32, so the height contract survives the snap untouched — at
    1/30 it would not, and build-cc0.mjs would fail the build rather than ship a body whose
    joints have all quietly shifted. Rounded with floor(v/g + 0.5) rather than round(), which in
    Python rounds halves to even and would bias one side of the body against the other.
    """
    part.v = [(math.floor(x / g + 0.5) * g, math.floor(y / g + 0.5) * g,
               math.floor(z / g + 0.5) * g) for (x, y, z) in part.v]
    return part


def pt(name, dy=0.0):
    """A joint as a 3-D point. Joints are authored on the centre plane; `dy` pushes one into
    depth so front and back limbs are not co-planar and can be told apart from the side."""
    x, z = J[name]
    return (x, dy, z)


# ── the three bodies ─────────────────────────────────────────────────────────────────────────
# One builder; the silhouette is entirely in these numbers. Read a column top-to-bottom and you
# can predict the fighter before you render it, which is the test of whether the parameterisation
# is the right one.

SPECS = {
    # ── lank ← mfers ─────────────────────────────────────────────────────────────────────────
    # sartoshi's mfers are hand-drawn: the head is small, the limbs are far too long and far too
    # thin for it, the shoulders slope away, and the feet are comically oversized. Nothing about
    # that is anatomy — it is the wobble of a line drawn fast, and the ratios survive the
    # translation into geometry even though the line does not.
    'lank': dict(
        seed=7001,
        head=(0.135, 0.130, 0.165), head_dy=0.004, head_tilt=0.10,
        chest=(0.175, 0.140), chest_top=0.205, chest_lean=0.022,
        pelvis=(0.155, 0.135),
        arm_r=(0.024, 0.019), fore_r=(0.020, 0.016), hand=(0.055, 0.042, 0.052),
        thigh_r=(0.041, 0.031), shin_r=(0.032, 0.024),
        foot=(0.088, 0.195, 0.062), foot_fwd=0.052,
        limb_squash=0.88, asym=0.0,
    ),
    # ── squat ← CrypToadz ────────────────────────────────────────────────────────────────────
    # GREMPLIN's toadz sit LOW. The mass is all in the bottom third, the head is wider than it is
    # tall and sits straight on the body with no neck to speak of, and the feet are planted and
    # splayed. A fighter built this way reads as heavy before it has thrown a punch, which is
    # exactly what a silhouette is for.
    'squat': dict(
        seed=7002,
        head=(0.300, 0.220, 0.150), head_dy=0.0, head_tilt=-0.05,
        chest=(0.320, 0.235), chest_top=0.300, chest_lean=0.010,
        pelvis=(0.300, 0.225),
        arm_r=(0.052, 0.044), fore_r=(0.046, 0.038), hand=(0.098, 0.078, 0.086),
        thigh_r=(0.070, 0.058), shin_r=(0.060, 0.050),
        foot=(0.145, 0.245, 0.070), foot_fwd=0.062,
        limb_squash=1.0, asym=0.0,
    ),
    # ── lump ← goblintown ────────────────────────────────────────────────────────────────────
    # goblintown's move is that NOTHING is symmetrical and nothing is smooth. `asym` is the whole
    # character: it scales the front side up and the back side down, drops one shoulder, and lets
    # the jitter roughen every blob. A body that is merely "ugly" still reads as a mannequin; a
    # body that is LOPSIDED reads as alive.
    'lump': dict(
        seed=7003,
        head=(0.205, 0.185, 0.170), head_dy=-0.012, head_tilt=0.22,
        chest=(0.255, 0.205), chest_top=0.290, chest_lean=0.040,
        pelvis=(0.230, 0.195),
        arm_r=(0.058, 0.036), fore_r=(0.042, 0.030), hand=(0.086, 0.070, 0.078),
        thigh_r=(0.062, 0.046), shin_r=(0.048, 0.036),
        foot=(0.120, 0.205, 0.066), foot_fwd=0.046,
        limb_squash=0.94, asym=0.34,
    ),

    # ══ SECOND SET — task #85 ═════════════════════════════════════════════════════════════════

    # ── mascot ← THE ARTIST'S OWN Fake Rares / Rare Pepe practice ────────────────────────────
    # ATTESTED and in scope: the artist's own submissions are the artist's own work, so this is
    # the one body here that asks nobody. What is taken is the artist's own stated lineage —
    # MAD magazine and cereal boxes, then the arcade — expressed as the MASCOT PROPORTION: a head
    # that is a quarter of the whole body, arms of CONSTANT radius (rubber hose: a mascot's arm is
    # a drawn line of even weight, it does not taper like a limb), mitts and shoes far too big.
    # ⛔ No Pepe and nothing amphibian. See the header.
    'mascot': dict(
        file='rip-mascot', seed=7101,
        head=(0.310, 0.280, 0.240), head_dy=0.008, head_tilt=0.20,
        chest=(0.225, 0.195), chest_top=0.240, chest_lean=0.020,
        pelvis=(0.210, 0.185),
        arm_r=(0.038, 0.038), fore_r=(0.036, 0.036),      # ← no taper: that IS the rubber hose
        hand=(0.112, 0.098, 0.106),
        thigh_r=(0.054, 0.052), shin_r=(0.050, 0.048),
        foot=(0.150, 0.285, 0.082), foot_fwd=0.074,
        limb_squash=1.0, asym=0.0,
        seg=12, rings=7,
    ),

    # ── mosh ← XCOPY ─────────────────────────────────────────────────────────────────────────
    # VERIFIED, evidence class A (xcopy.art/creative-commons), SOLO WORK ONLY — the licence page
    # excludes collaborations itself. Nothing from a specific piece is used, because that page
    # names no works; what is used is the general vocabulary the dossier already measured.
    # The body is authored FLAT across the fight line (limb_squash 0.72) — an XCOPY figure is an
    # image, not a sculpture — and then `tear` mis-registers it. It reads as a person who did not
    # finish decoding, which is the whole idea and is not anybody's character.
    'mosh': dict(
        seed=7102,
        head=(0.148, 0.112, 0.182), head_dy=0.0, head_tilt=0.06,
        chest=(0.178, 0.118), chest_top=0.214, chest_lean=0.014,
        pelvis=(0.150, 0.114),
        arm_r=(0.028, 0.020), fore_r=(0.022, 0.017), hand=(0.058, 0.040, 0.056),
        thigh_r=(0.044, 0.032), shin_r=(0.034, 0.026),
        foot=(0.090, 0.192, 0.058), foot_fwd=0.048,
        limb_squash=0.72, asym=0.0,
        seg=10, rings=6,
        tear=dict(band=0.040, amt=0.046, prob=0.38, step=0.0115),
    ),

    # ── cel ← Darkfarms1 (SMOWLz) ────────────────────────────────────────────────────────────
    # VERIFIED (class C) + ATTESTED — "darkfarms is cc0 is my friend". SMOWLz ONLY: the dossier
    # says in as many words not to stretch the general attestation to Decal or BOME, and nothing
    # here does. No owl, no bird, no beak, no wing, no ear, no trait, no name.
    # Two measured facts drive the shape. (1) "smol": the mass sits high and round, the limbs are
    # short and stubby. (2) 21.4% of every token is pure-black KEYLINE — so every mass carries a
    # raised belt at its equator, and the facet count drops to 8×5 because a cel fill is flat by
    # definition and a smooth 12×7 blob is a gradient with extra steps.
    'cel': dict(
        seed=7103,
        head=(0.322, 0.292, 0.252), head_dy=0.0, head_tilt=0.09,
        chest=(0.186, 0.162), chest_top=0.204, chest_lean=0.008,
        pelvis=(0.182, 0.160),
        arm_r=(0.036, 0.031), fore_r=(0.031, 0.027), hand=(0.070, 0.060, 0.066),
        thigh_r=(0.050, 0.042), shin_r=(0.042, 0.035),
        foot=(0.092, 0.140, 0.052), foot_fwd=0.030,     # ← SMALL feet: the opposite of the mascot
        limb_squash=1.0, asym=0.0,
        seg=8, rings=5,
        key=0.075,
    ),

    # ── grid ← Nouns ─────────────────────────────────────────────────────────────────────────
    # VERIFIED, evidence class A, and the strongest artefact in the dossier: the CC0 1.0 legalcode
    # hash is a bytes32 constant IN THE ART CONTRACT. What is taken is the construction logic —
    # strict grid, flat fill, hard edge, no gradient, no anti-alias — pushed into a third axis by
    # `quant`. Deliberately the only symmetrical body in the set (lean 0, tilt 0, asym 0): the
    # others earn character from wobble, this one earns it from refusing to.
    # ⛔ ZERO Noun-shaped geometry and NO NOGGLES. The eyewear is the mark; the palette is the
    # dedication. No face is modelled here at all, which settles it.
    'grid': dict(
        seed=7104,
        head=(0.192, 0.182, 0.172), head_dy=0.0, head_tilt=0.0,
        chest=(0.300, 0.232), chest_top=0.312, chest_lean=0.0,
        pelvis=(0.272, 0.222),
        arm_r=(0.078, 0.068), fore_r=(0.068, 0.060), hand=(0.108, 0.096, 0.100),
        thigh_r=(0.080, 0.068), shin_r=(0.070, 0.060),
        foot=(0.142, 0.212, 0.100), foot_fwd=0.040,
        limb_squash=1.0, asym=0.0,
        seg=8, rings=5,
        quant=1.0 / 32.0,
    ),
}


def build(name, s):
    """Emit the fifteen named parts for one body. Every part is its own object because the rig
    attaches by object name — merging two of them would weld two joints together."""
    r = kit.rng(s['seed'])
    lumpy = s['asym'] > 0.01
    jit = r if lumpy else None
    parts = []

    def P(n):
        p = kit.Part(n)
        parts.append(p)
        return p

    # ── facet density ────────────────────────────────────────────────────────────────────────
    # `seg`/`rings` are CAPS, not replacements, and that is deliberate: every density below stays
    # the number it was authored as unless a body asks for something coarser. The first three
    # bodies name neither key, so they come out byte-identical to what already ships — which
    # matters, because models/cc0-*.skn are baked from these GLBs and a silent geometry change
    # would invalidate every stretch number in models/README.md at once.
    sg = (lambda n, c=s.get('seg', 99): min(n, c))
    rg = (lambda n, c=s.get('rings', 99): min(n, c))
    KEY = s.get('key', 0.0)          # Darkfarms keyline, as a fraction of each mass's radius

    # ── head ─────────────────────────────────────────────────────────────────────────────────
    # Spans from the head joint (0.84) to exactly 1.0. NOTHING may be taller: registerModel()
    # normalises on total height, so an extra 0.02 of crown silently rescales the whole skeleton
    # and every joint below drifts off its part.
    hx, hy, hz = s['head']
    p = P('head')
    hc = (0.0, s['head_dy'], 1.0 - hz / 2.0)
    blob(p, hc, (hx / 2, hy / 2, hz / 2), seg=sg(12), rings=rg(7), jitter=jit, inward=True)
    # jaw/brow mass, offset by head_tilt so the head has a front and is never a perfect ovoid
    blob(p, (s['head_tilt'] * 0.10, s['head_dy'] - hy * 0.20, hc[2] - hz * 0.18),
         (hx * 0.40, hy * 0.32, hz * 0.24), seg=sg(10), rings=rg(5), jitter=jit)
    # neck — short, and short on purpose: it is the thing that makes squat read as squat
    limb(p, pt('head'), (0.0, s['head_dy'] * 0.5, J['head'][1] + hz * 0.22),
         hx * 0.26, hx * 0.30, seg=sg(8))
    if KEY:
        belt(p, hc, (hx / 2, hy / 2), 1.0 + KEY, seg=sg(10))

    # ── chest ────────────────────────────────────────────────────────────────────────────────
    # From the chest joint (0.62) up to the shoulder line (0.80). Widening toward the top
    # (`chest_top`) is what gives a fighter shoulders; leaning it forward (`chest_lean`) is what
    # gives it a stance instead of a posture.
    cw, cd = s['chest']
    p = P('chest')
    z0, z1 = J['chest'][1], J['shoulder_f'][1]
    blob(p, (0.0, s['chest_lean'] * 0.5, (z0 + z1) / 2 + 0.005),
         (s['chest_top'] / 2, cd / 2, (z1 - z0) / 2 + 0.045), seg=sg(12), rings=rg(7), jitter=jit)
    blob(p, (0.0, s['chest_lean'], z0 + 0.010), (cw / 2, cd / 2 * 0.94, 0.055),
         seg=sg(10), rings=rg(5), jitter=jit)
    if KEY:
        belt(p, (0.0, s['chest_lean'] * 0.5, (z0 + z1) / 2 + 0.005),
             (s['chest_top'] / 2, cd / 2), 1.0 + KEY, seg=sg(10))
    if lumpy:                                          # one shoulder carries the body, one hangs
        blob(p, (0.09, -0.02, z1 - 0.010), (0.105, 0.085, 0.075), seg=10, rings=5, jitter=jit)
        blob(p, (-0.075, 0.015, z1 - 0.045), (0.055, 0.050, 0.045), seg=8, rings=4, jitter=jit)

    # ── pelvis ───────────────────────────────────────────────────────────────────────────────
    # ⚠ The pelvis must OVERLAP the chest, not meet it. The first render showed daylight between
    # them: chest's lower blob bottomed out at 0.575 and the pelvis topped out at 0.560, and 15
    # thousandths of a unit reads unmistakably as a body cut in half. Parts move independently at
    # run time, so a butt joint that is flush at rest opens the moment the fighter bends.
    pw, pd = s['pelvis']
    p = P('pelvis')
    blob(p, (0.0, 0.0, J['pelvis'][1]), (pw / 2, pd / 2, 0.088), seg=sg(10), rings=rg(6), jitter=jit)
    if KEY:
        belt(p, (0.0, 0.0, J['pelvis'][1]), (pw / 2, pd / 2), 1.0 + KEY, seg=sg(10))

    # ── arms ─────────────────────────────────────────────────────────────────────────────────
    # Authored along the joint chain, so the part's own axis IS the bone. Depth (`dy`) separates
    # front from back: without it the two arms are co-planar and the fighter loses a dimension
    # the moment the camera swings.
    for side, dy, sc in (('f', -0.028, 1.0 + s['asym']), ('b', 0.030, 1.0 - s['asym'] * 0.55)):
        p = P('shoulder_' + side)
        limb(p, pt('shoulder_' + side, dy), pt('elbow_' + side, dy),
             s['arm_r'][0] * sc, s['arm_r'][1] * sc, seg=sg(8), squash=s['limb_squash'])
        blob(p, pt('shoulder_' + side, dy),
             (s['arm_r'][0] * 1.25 * sc,) * 2 + (s['arm_r'][0] * 1.25 * sc,),
             seg=sg(8), rings=rg(5), jitter=jit)

        p = P('elbow_' + side)
        limb(p, pt('elbow_' + side, dy), pt('hand_' + side, dy),
             s['fore_r'][0] * sc, s['fore_r'][1] * sc, seg=sg(8), squash=s['limb_squash'])

        p = P('hand_' + side)
        hwx, hwy, hwz = s['hand']
        # the fist reaches slightly past the hand joint — a hand that stops AT the joint reads as
        # an amputation, because the joint is the wrist
        blob(p, (J['hand_' + side][0] + (0.026 if side == 'f' else -0.026), dy, J['hand_' + side][1]),
             (hwx / 2 * sc, hwy / 2 * sc, hwz / 2 * sc), seg=sg(9), rings=rg(5), jitter=jit)
        if KEY:
            belt(p, (J['hand_' + side][0] + (0.026 if side == 'f' else -0.026), dy, J['hand_' + side][1]),
                 (hwx / 2 * sc, hwy / 2 * sc), 1.0 + KEY, t=0.016, seg=sg(9))

    # ── legs ─────────────────────────────────────────────────────────────────────────────────
    for side, dy, sc in (('f', -0.030, 1.0 + s['asym'] * 0.5), ('b', 0.032, 1.0 - s['asym'] * 0.3)):
        p = P('thigh_' + side)
        limb(p, pt('thigh_' + side, dy), pt('shin_' + side, dy),
             s['thigh_r'][0] * sc, s['thigh_r'][1] * sc, seg=sg(8), squash=s['limb_squash'])
        blob(p, pt('thigh_' + side, dy), (s['thigh_r'][0] * 1.2 * sc,) * 3, seg=sg(8), rings=rg(5),
             jitter=jit)

        p = P('shin_' + side)
        limb(p, pt('shin_' + side, dy), pt('foot_' + side, dy),
             s['shin_r'][0] * sc, s['shin_r'][1] * sc, seg=sg(8), squash=s['limb_squash'])

        # ── foot ─────────────────────────────────────────────────────────────────────────────
        # The sole sits at EXACTLY z=0 — it is the model's floor and half of the normalisation
        # contract. Feet run forward in +y (depth), because a foot that runs along the fight line
        # disappears in the side-on view this game is played in.
        p = P('foot_' + side)
        fw, fl, fh = s['foot']
        fx = J['foot_' + side][0]
        p.box((fx, dy - s['foot_fwd'] * 0.35, fh / 2.0), (fw * sc, fl, fh))
        p.box((fx, dy - s['foot_fwd'] - fl * 0.42, fh * 0.36), (fw * 0.82 * sc, fl * 0.34, fh * 0.72))

    # ── the construction-rule operators ──────────────────────────────────────────────────────
    # Applied to the FINISHED vertices, after every primitive is in, and before emit() realises
    # the Blender mesh. Order matters and only one way round works: `tear` shifts in x, so
    # quantising afterwards keeps a torn body on the lattice, whereas tearing a quantised body by
    # an offset that is not a lattice multiple would take it straight back off again.
    # Neither operator touches z, or `quant` snaps to a lattice that contains 0 and 1.0 exactly,
    # so the sole/crown contract asserted below survives both untouched.
    T, Q = s.get('tear'), s.get('quant')
    for p in parts:
        if T:
            tear(p, **T)
        if Q:
            quantise(p, Q)
        p.emit()

    # The normalisation contract, asserted at the source rather than hoped for downstream.
    # registerModel() derives scale from total height and then places parts at joints expressed as
    # fractions of it, so a single vertex above the crown or below the sole shifts EVERY joint.
    # scripts/build-cc0.mjs reads this line and fails the build on it.
    zs = [v[2] for p in parts for v in p.v]
    print('BOUNDS %.6f %.6f' % (min(zs), max(zs)))
    return len(parts)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else 'models/cc0'
    only = argv[1] if len(argv) > 1 else None

    for name, spec in SPECS.items():
        if only and only != name:
            continue
        kit.reset()
        n = build(name, spec)
        # ⚑ The FILE name is not always `cc0-<key>`. `rip-mascot` is the artist's own lineage and
        # is not third-party CC0 at all, so calling it cc0-anything would be a provenance claim
        # made by a filename — the one place nobody re-reads. See models/cc0/README.md.
        path = os.path.join(outdir, spec.get('file', 'cc0-%s' % name) + '.glb')
        print('BODY %s — %d parts' % (name, n))
        kit.export_glb(path)


main()

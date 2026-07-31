# upperdeckripmaster3030 — CC0-lineage fighter bodies, authored in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-cc0-chars.py -- models/cc0
#   (or just: npm run cc0)
#
# Writes one GLB per body: cc0-lank.glb · cc0-squat.glb · cc0-lump.glb
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

    # ── head ─────────────────────────────────────────────────────────────────────────────────
    # Spans from the head joint (0.84) to exactly 1.0. NOTHING may be taller: registerModel()
    # normalises on total height, so an extra 0.02 of crown silently rescales the whole skeleton
    # and every joint below drifts off its part.
    hx, hy, hz = s['head']
    p = P('head')
    hc = (0.0, s['head_dy'], 1.0 - hz / 2.0)
    blob(p, hc, (hx / 2, hy / 2, hz / 2), seg=12, rings=7, jitter=jit, inward=True)
    # jaw/brow mass, offset by head_tilt so the head has a front and is never a perfect ovoid
    blob(p, (s['head_tilt'] * 0.10, s['head_dy'] - hy * 0.20, hc[2] - hz * 0.18),
         (hx * 0.40, hy * 0.32, hz * 0.24), seg=10, rings=5, jitter=jit)
    # neck — short, and short on purpose: it is the thing that makes squat read as squat
    limb(p, pt('head'), (0.0, s['head_dy'] * 0.5, J['head'][1] + hz * 0.22),
         hx * 0.26, hx * 0.30, seg=8)

    # ── chest ────────────────────────────────────────────────────────────────────────────────
    # From the chest joint (0.62) up to the shoulder line (0.80). Widening toward the top
    # (`chest_top`) is what gives a fighter shoulders; leaning it forward (`chest_lean`) is what
    # gives it a stance instead of a posture.
    cw, cd = s['chest']
    p = P('chest')
    z0, z1 = J['chest'][1], J['shoulder_f'][1]
    blob(p, (0.0, s['chest_lean'] * 0.5, (z0 + z1) / 2 + 0.005),
         (s['chest_top'] / 2, cd / 2, (z1 - z0) / 2 + 0.045), seg=12, rings=7, jitter=jit)
    blob(p, (0.0, s['chest_lean'], z0 + 0.010), (cw / 2, cd / 2 * 0.94, 0.055),
         seg=10, rings=5, jitter=jit)
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
    blob(p, (0.0, 0.0, J['pelvis'][1]), (pw / 2, pd / 2, 0.088), seg=10, rings=6, jitter=jit)

    # ── arms ─────────────────────────────────────────────────────────────────────────────────
    # Authored along the joint chain, so the part's own axis IS the bone. Depth (`dy`) separates
    # front from back: without it the two arms are co-planar and the fighter loses a dimension
    # the moment the camera swings.
    for side, dy, sc in (('f', -0.028, 1.0 + s['asym']), ('b', 0.030, 1.0 - s['asym'] * 0.55)):
        p = P('shoulder_' + side)
        limb(p, pt('shoulder_' + side, dy), pt('elbow_' + side, dy),
             s['arm_r'][0] * sc, s['arm_r'][1] * sc, squash=s['limb_squash'])
        blob(p, pt('shoulder_' + side, dy),
             (s['arm_r'][0] * 1.25 * sc,) * 2 + (s['arm_r'][0] * 1.25 * sc,),
             seg=8, rings=5, jitter=jit)

        p = P('elbow_' + side)
        limb(p, pt('elbow_' + side, dy), pt('hand_' + side, dy),
             s['fore_r'][0] * sc, s['fore_r'][1] * sc, squash=s['limb_squash'])

        p = P('hand_' + side)
        hwx, hwy, hwz = s['hand']
        # the fist reaches slightly past the hand joint — a hand that stops AT the joint reads as
        # an amputation, because the joint is the wrist
        blob(p, (J['hand_' + side][0] + (0.026 if side == 'f' else -0.026), dy, J['hand_' + side][1]),
             (hwx / 2 * sc, hwy / 2 * sc, hwz / 2 * sc), seg=9, rings=5, jitter=jit)

    # ── legs ─────────────────────────────────────────────────────────────────────────────────
    for side, dy, sc in (('f', -0.030, 1.0 + s['asym'] * 0.5), ('b', 0.032, 1.0 - s['asym'] * 0.3)):
        p = P('thigh_' + side)
        limb(p, pt('thigh_' + side, dy), pt('shin_' + side, dy),
             s['thigh_r'][0] * sc, s['thigh_r'][1] * sc, squash=s['limb_squash'])
        blob(p, pt('thigh_' + side, dy), (s['thigh_r'][0] * 1.2 * sc,) * 3, seg=8, rings=5,
             jitter=jit)

        p = P('shin_' + side)
        limb(p, pt('shin_' + side, dy), pt('foot_' + side, dy),
             s['shin_r'][0] * sc, s['shin_r'][1] * sc, squash=s['limb_squash'])

        # ── foot ─────────────────────────────────────────────────────────────────────────────
        # The sole sits at EXACTLY z=0 — it is the model's floor and half of the normalisation
        # contract. Feet run forward in +y (depth), because a foot that runs along the fight line
        # disappears in the side-on view this game is played in.
        p = P('foot_' + side)
        fw, fl, fh = s['foot']
        fx = J['foot_' + side][0]
        p.box((fx, dy - s['foot_fwd'] * 0.35, fh / 2.0), (fw * sc, fl, fh))
        p.box((fx, dy - s['foot_fwd'] - fl * 0.42, fh * 0.36), (fw * 0.82 * sc, fl * 0.34, fh * 0.72))

    for p in parts:
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
        path = os.path.join(outdir, 'cc0-%s.glb' % name)
        print('BODY %s — %d parts' % (name, n))
        kit.export_glb(path)


main()

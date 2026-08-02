# ripmaster3030studios — SECTION 9's four weapons, authored in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-guns.py -- models/weapons/s9-guns.glb
#   (or just: npm run guns)
#
# ⛔ WHY THIS FILE EXISTS. Section 9 shipped with FOUR weapons and ONE model. `loadWeapon()` fetched
#    `models/weapons/m4a1.glb` once and `giveWeapon()` handed that same carbine to every operative,
#    so a pistol, a shotgun and a bolt rifle were all drawn as the same M4. The artist's note was
#    "all the guns look like the same gun. the guns are misnamed", and both halves were literal:
#    one mesh, and names describing weapons that were not on screen.
#
# ONE FILE, FOUR PARTS — the same contract as models/dogfight.glb, whose object names ARE the
# interface with the renderer. js/s9pc-app.js looks these up by name:
#
#     gun_pistol     SIDE BET     short, no stock, tall grip — reads as "small" instantly
#     gun_smg        FULL TILT    the workhorse: handguard, box mag, full stock
#     gun_shotgun    SCATTER      fat barrel + underslung pump, stubby — reads as "wide"
#     gun_sniper     COLD CALL    longest and thinnest, big scope, bipod — reads as "far"
#
# ── THE BRIEF (docs/DESIGN-SYSTEM.md §8) ────────────────────────────────────────────────────────
#
# 1. MADE OF — stamped steel and moulded polymer. Dark and matte, deliberately in the same value
#    band as the operatives (0.16–0.26 albedo). ⚠ NOT chrome: js/s9pc-world.js keeps arena walls at
#    0.60–0.70 specifically so a dark silhouette reads against them, and a bright gun would become
#    the most salient thing on the screen — brighter than the person carrying it.
#
# 2. LIT BY — nothing of its own. It takes the arena's lights through the same material path as
#    every other surface, so a weapon in a red-lit corridor is red like the wall behind it.
#
# 3. WHAT MOVES, AND WHY — nothing on the weapon itself. It is a rigid object carried in a hand:
#    all of its motion is the SKELETON's, through `pose.grip` and `pose.muzzle`. The recoil already
#    lives in game state. ⚑ Adding an idle wobble here would be motion for its own sake — the thing
#    §4 rules out — and would fight the pose that is already driving it.
#
# 4. SITS ON — the operative's hands. Authored barrel-along-+x so `fitWeapon()`'s "longest axis is
#    the barrel line" measurement lands on the right axis without a hand-tuned magic transform.
#
# 5. ACCEPTANCE — ⚑ THE FOUR MUST BE TELLABLE APART BY SILHOUETTE ALONE. That is the actual
#    complaint, so it is the actual test: `npm run test:guns` projects each mesh to its side view,
#    rasterises it, and asserts every PAIR has an intersection-over-union below a threshold. Four
#    copies of one carbine score ~1.0 and fail. Four names on one mesh cannot pass.
#    ⚠ IoU is computed on the NORMALISED silhouette, i.e. after each gun is scaled to the length
#    the game will draw it at — otherwise "one is bigger" would count as "they look different",
#    and the game normalises length anyway.
#
# ── ORIENTATION ─────────────────────────────────────────────────────────────────────────────────
# Authored +x muzzle / +z up, which is what `fitWeapon` expects to discover. glTF export maps
# Blender (x, y, z) -> (x, z, -y), so +x stays the barrel and Blender +z becomes glTF +y (up).
# No node rotation is written here, unlike build-craft.py — these need none, and a rotation nobody
# needs is a rotation a loader can drop (which is exactly what happened to the dogfight craft).

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit                                                     # noqa: E402

TAU = math.pi * 2


def receiver(p, x0, x1, w, h, z=0.0):
    """The body every firearm here shares — a squared-off box with a cut-down top rail."""
    p.box(((x0 + x1) / 2, 0, z), (x1 - x0, w, h))
    p.box(((x0 + x1) / 2, 0, z + h / 2 + 0.008), (x1 - x0, w * 0.44, 0.016))   # rail
    return p


def grip(p, x, z, drop=0.115, rake=0.30):
    """Pistol grip, raked back. `rake` is how far the heel trails the web, in units."""
    n = 4
    for i in range(n):
        f = i / float(n - 1)
        p.box((x - rake * f, 0, z - drop * f - drop / (2.0 * n)),
              (0.052 - 0.006 * f, 0.040, drop / n * 1.35))
    return p


def mag(p, x, z, depth, w=0.030, curve=0.0):
    """Box magazine hanging under the receiver; `curve` trails the toe forward."""
    n = 3
    for i in range(n):
        f = i / float(n - 1)
        p.box((x + curve * f * f, 0, z - depth * (i + 0.5) / n),
              (0.062 - 0.004 * i, w, depth / n * 1.1))
    return p


def stock(p, x0, x1, z, h=0.085):
    """Shoulder stock: a comb, a toe, and the hollow between them left open."""
    p.box(((x0 + x1) / 2, 0, z + h * 0.34), (x1 - x0, 0.042, h * 0.32))        # comb
    p.box(((x0 + x1) / 2 - 0.02, 0, z - h * 0.30), (x1 - x0 - 0.04, 0.042, h * 0.28))  # toe
    p.box((x0 + 0.012, 0, z), (0.024, 0.044, h))                               # butt plate
    return p


def barrel(p, x0, x1, r, z=0.0, seg=10):
    """A barrel lies ALONG +x, so it is a cylinder turned onto its side.

    ⚠ kit.Part.cyl stands on Z. There is no rotation argument, so the tube is built here by hand
      rather than by rotating a cylinder afterwards — rotating an emitted object would put a node
      transform in the file for a purely authoring-side convenience.
    """
    b = len(p.v)
    for i in range(seg):
        a = TAU * i / seg
        p.v.append((x0, math.cos(a) * r, z + math.sin(a) * r))
    for i in range(seg):
        a = TAU * i / seg
        p.v.append((x1, math.cos(a) * r, z + math.sin(a) * r))
    for i in range(seg):
        j = (i + 1) % seg
        p.f.append((b + i, b + seg + i, b + seg + j, b + j))
    p.f.append(tuple(b + i for i in range(seg)))
    p.f.append(tuple(b + seg + i for i in range(seg - 1, -1, -1)))
    return p


def scope(p, x0, x1, z, r=0.030):
    """Tube plus two rings plus two mounts. The rings are what make it read as GLASS at range."""
    barrel(p, x0, x1, r * 0.72, z)
    barrel(p, x0 - 0.018, x0 + 0.010, r, z)          # objective bell
    barrel(p, x1 - 0.014, x1 + 0.012, r * 0.88, z)   # ocular
    for mx in (x0 + 0.055, x1 - 0.055):
        p.box((mx, 0, z - r * 0.86), (0.020, 0.030, r * 0.80))
    return p


# ── the four ────────────────────────────────────────────────────────────────────────────────────

def build_pistol():
    """SIDE BET. NO STOCK and a tall grip — that absence is the whole silhouette. A pistol has to
    read as 'small' in a single frame at 30 m, so it is the only one of the four with nothing
    behind the grip at all."""
    p = kit.Part('gun_pistol')
    receiver(p, -0.055, 0.150, 0.046, 0.062)          # slide
    barrel(p, 0.150, 0.196, 0.014)
    grip(p, -0.030, -0.031, drop=0.135, rake=0.055)   # nearly vertical, deep
    p.box((0.045, 0, -0.040), (0.070, 0.030, 0.028))  # trigger guard block
    p.box((-0.048, 0, 0.016), (0.020, 0.040, 0.050))  # hammer shroud
    return p


def build_smg():
    """FULL TILT. The workhorse and the visual middle: handguard, box mag, full stock. Everything
    else is defined against this one, so it is deliberately the least distinctive."""
    p = kit.Part('gun_smg')
    receiver(p, -0.090, 0.180, 0.050, 0.070)
    barrel(p, 0.180, 0.395, 0.012)
    p.box((0.255, 0, 0.006), (0.150, 0.056, 0.052))   # handguard
    for i in range(5):                                 # vent slots, read as texture at range
        p.box((0.200 + i * 0.030, 0, 0.040), (0.016, 0.058, 0.008))
    mag(p, 0.045, -0.035, 0.150, w=0.030, curve=0.022)
    grip(p, -0.020, -0.035, drop=0.115, rake=0.052)
    stock(p, -0.300, -0.090, 0.010, h=0.088)
    p.box((0.150, 0, 0.058), (0.030, 0.024, 0.030))   # front post
    return p


def build_shotgun():
    """SCATTER. FAT and SHORT. Read is the underslung pump tube doubling the barrel line — the only
    one of the four with two parallel tubes, which is legible even in silhouette at distance."""
    p = kit.Part('gun_shotgun')
    receiver(p, -0.075, 0.115, 0.060, 0.078)
    barrel(p, 0.115, 0.400, 0.023)                    # thick bore
    barrel(p, 0.115, 0.360, 0.017, z=-0.040)          # magazine tube under it
    p.box((0.250, 0, -0.040), (0.110, 0.052, 0.046))  # the pump itself
    for i in range(4):
        p.box((0.205 + i * 0.030, 0, -0.040), (0.012, 0.056, 0.050))   # pump ribs
    grip(p, -0.020, -0.040, drop=0.108, rake=0.060)
    stock(p, -0.245, -0.075, 0.006, h=0.092)
    p.box((0.385, 0, 0.030), (0.024, 0.020, 0.022))   # bead sight
    return p


def build_sniper():
    """COLD CALL. LONGEST and THINNEST, and the only one carrying a scope and a bipod. Those two
    additions are above and below the barrel line, so the silhouette grows in a direction none of
    the other three do."""
    p = kit.Part('gun_sniper')
    receiver(p, -0.115, 0.145, 0.046, 0.066)
    barrel(p, 0.145, 0.560, 0.014)
    p.box((0.520, 0, 0), (0.070, 0.032, 0.032))       # muzzle brake
    for i in range(3):
        p.box((0.500 + i * 0.022, 0, 0), (0.008, 0.038, 0.038))
    scope(p, 0.010, 0.190, 0.078, r=0.032)
    mag(p, 0.030, -0.033, 0.085, w=0.026)
    grip(p, -0.045, -0.033, drop=0.118, rake=0.050)
    stock(p, -0.360, -0.115, 0.008, h=0.080)
    p.box((-0.330, 0, 0.060), (0.090, 0.040, 0.026))  # cheek riser
    for s in (-1, 1):                                  # bipod, splayed
        for i in range(3):
            f = i / 2.0
            p.box((0.360 - 0.020 * f, s * (0.020 + 0.030 * f), -0.030 - 0.038 * f),
                  (0.016, 0.014, 0.040))
    return p


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[0] if argv else 'models/weapons/s9-guns.glb'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)

    kit.reset()
    parts = [build_pistol(), build_smg(), build_shotgun(), build_sniper()]
    stats = []
    for p in parts:
        ob = p.emit()
        if ob is None:
            raise SystemExit('EMPTY PART ' + p.name)
        xs = [v[0] for v in p.v]
        ys = [v[1] for v in p.v]
        zs = [v[2] for v in p.v]
        tris = sum(len(f) - 2 for f in p.f)
        stats.append((p.name, len(p.v), tris,
                      max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))

    kit.export_glb(out)
    total = 0
    for (n, nv, nt, sx, sy, sz) in stats:
        total += nt
        print('  PART %-12s verts=%4d tris=%4d  L=%.3f W=%.3f H=%.3f  aspect L/H=%.2f'
              % (n, nv, nt, sx, sy, sz, sx / (sz or 1)))
    print('GUNS_OK glb=%s parts=%d tris=%d' % (out, len(stats), total))


main()

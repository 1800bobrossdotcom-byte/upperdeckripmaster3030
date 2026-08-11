# ripmaster3030studios — THE LIGHT: the swords and the figures, authored in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-blade.py -- models/blade.glb
#   (or: npm run blade)
#
# Artist, 2026-08-07: "light sword fighting the dark, over the shoulder cam - made specifically for
# phone. control is double tap and drag for slashing, blocking, fast movement. the finger is the
# sword and you fight the other on coming swords."
#
# ── THE BRIEF (DESIGN-SYSTEM §9: made of, lit, what moves and WHY it physically moved, sits on,
#    acceptance) — written before a vertex, because §9's whole record is that a mood produces the
#    default and this studio has three rejected objects proving it.
#
#   MADE OF · The light blade is not a glowing stick. It is a die-cut strip of FOIL — the same
#     material the studio's own wordmark is stamped in — so it has a spine, a bevel and a ground
#     edge, and it catches light along its length rather than emitting flatly. The dark blades are
#     the same shape CUT FROM THE OPPOSITE STOCK: matte, unlit, an absence. ⚑ That is why they read
#     against each other on a phone at arm's length — one takes the light and one takes it away —
#     and it is a material argument rather than a colour one.
#   LIT · One key, low and behind the player's shoulder, so the light blade is rim-lit along its
#     spine and the dark blade is a silhouette with a hot edge only where it turns. The floor takes
#     nothing; it is there to say where the ground is.
#   WHAT MOVES AND WHY · A blade pivots at the HAND, not at its middle — every arc in this game is
#     a wrist and a shoulder, so the geometry is authored with the origin at the grip. A blade
#     swung about its centre reads as a floating prop, which is the exact "technically correct and
#     dead" failure §9 records.
#   SITS ON · Black stock. No horizon, no skybox: the fight is the only thing lit.
#   ACCEPTANCE · every part below present by NAME in the GLB · the light blade's origin is at the
#     grip (asserted, not eyeballed) · blade length within 8% of 1.0 so the game's own reach
#     numbers mean world units · the dark blade is the same length as the light one, because a duel
#     where one weapon is secretly longer is a duel nobody can read.
#
# ── THE CONTRACT. Object names are what blade.html keys on; a missing one falls back to a
#    primitive and NOTHING THROWS, which is this repo's most-recorded failure shape. The runner
#    (scripts/build-blade.mjs) asserts every one, and asserts the two measurements above.
#
#     blade_light   the player's blade — grip at origin, tip at +z, length 1.0
#     blade_dark    the oncoming blade — same length, matte stock
#     hilt          guard + grip, shared silhouette, drawn under both blades
#     foe           the dark figure that carries a blade: a shoulder line and a head, no more
#     ground        the floor disc
#
# ── AXES. Authored in Blender's native Z-UP throughout, like every other script in this kit, and
#    kit.export_glb's `export_yup` turns it into the engine's Y-up: Blender (x, y, z) arrives as
#    glTF (x, z, −y). So for a blade authored tip-along-+z:
#       Blender x  → glTF x   the blade's WIDTH, which stays in the screen plane
#       Blender z  → glTF y   the blade's LENGTH
#       Blender y  → glTF −z  the blade's THICKNESS, toward/away from the camera
#    ⚑ That is what lets the view draw an arc with ONE number: rotate the blade node about the
#      camera's forward axis by the same `arc` angle js/blade-game.js reasons about. A blade
#      authored along any other axis would need the view to invent a second rotation, and a
#      second rotation is a second thing that can be 90° wrong without erroring.
#
# ⛔ NOTHING HERE USES bpy.ops.object.join(), AND THAT IS A FIX RATHER THAN A STYLE. The first
#    version joined by SELECTION, and the selection from the hilt's join was still standing when
#    the foe joined — so `hilt` was swallowed into `foe` and vanished from the export. Four parts
#    came out of a five-part contract, Blender reported success, and the only thing that said so
#    was counting the PART lines. kit.Part accumulates primitives into one named mesh without ever
#    touching selection, which is the convention this kit already documents.
# ⛔ AND kit.post() + rotation_euler DOES NOT TURN A PART, IT ORBITS IT. The rotation is about the
#    OBJECT origin, not the primitive's centre, so a grip authored at y −0.10 and turned 90° about
#    x came out at z −0.10 — right shape, wrong place, no error. Cylinders that need to run along
#    an axis other than z are built along that axis here (`barrel`), never turned into it.
#
import bpy, sys, os, math
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import kit

TAU = math.pi * 2

OUT = 'models/blade.glb'
if '--' in sys.argv:
    a = sys.argv[sys.argv.index('--') + 1:]
    if a: OUT = a[0]

kit.reset()

LEN = 1.0          # blade length in world units — the game's reach numbers are in these
GRIP = 0.17        # grip below the origin, so the origin IS where the hand is


def barrel(part, c, r, h, seg=10, axis='z', r2=None):
    """A capped cylinder running along `axis`, appended into an existing Part.

    kit.Part.cyl only stands on z. Turning one with rotation_euler orbits it about the object
    origin instead of spinning it in place (see the header) — so anything that needs to lie along
    x or y is generated along x or y.
    """
    if r2 is None: r2 = r
    b = len(part.v)
    ai = {'x': 0, 'y': 1, 'z': 2}[axis]
    u, w = [i for i in (0, 1, 2) if i != ai]
    for (end, rad) in ((-h / 2.0, r), (h / 2.0, r2)):
        for i in range(seg):
            a = TAU * i / seg
            p = [0.0, 0.0, 0.0]
            p[ai] = c[ai] + end
            p[u] = c[u] + math.cos(a) * rad
            p[w] = c[w] + math.sin(a) * rad
            part.v.append(tuple(p))
    for i in range(seg):
        j = (i + 1) % seg
        part.f.append((b + i, b + j, b + seg + j, b + seg + i))
    part.f.append(tuple(b + i for i in range(seg - 1, -1, -1)))
    part.f.append(tuple(b + seg + i for i in range(seg)))
    return part


def blade(name, width, thick, taper=0.34):
    """A die-cut strip with a spine and a ground edge. Origin at the GRIP, tip at +z.

    ⚠ Built from an explicit vertex list rather than a scaled cube because a blade has a
    CROSS-SECTION — a diamond, thick at the spine and thin at the edges — and that is the whole
    reason it catches a rim light along its length instead of reading as a rectangle. A box would
    have exactly two shading values as it turns; this one sweeps.
    """
    w, t = width * 0.5, thick * 0.5
    tw = w * taper
    p = kit.Part(name)
    # four stations up the blade: base, shoulder, mid, tip. The taper is mostly in the last third,
    # which is what makes a sword read as a sword rather than a wedge.
    rings = [(0.0, w, t), (LEN * 0.10, w, t), (LEN * 0.72, w * 0.86, t * 0.72), (LEN, tw, t * 0.22)]
    for (z, hw, ht) in rings:
        p.v += [(-hw, 0.0, z), (0.0, ht, z), (hw, 0.0, z), (0.0, -ht, z)]   # diamond section
    for r in range(len(rings) - 1):
        a, b = r * 4, (r + 1) * 4
        for i in range(4):
            j = (i + 1) % 4
            p.f.append((a + i, a + j, b + j, b + i))
    p.f.append((0, 3, 2, 1))                                   # cap the base
    n = len(p.v) - 4
    p.f.append((n, n + 1, n + 2, n + 3))                       # cap the tip
    return p.emit()


# ── the two blades. Same silhouette, same length: the duel has to be readable. ──────────────────
blade('blade_light', 0.062, 0.026)
blade('blade_dark',  0.062, 0.026)

# ── the hilt: a guard bar and a wrapped grip, hanging BELOW the origin so the blade's own origin
#    stays at the hand. ⚠ ONE object shared by both sides — a duel is two of the same weapon, and
#    two hilt meshes is two places for the silhouette to drift.
_h = kit.Part('hilt')
_h.box((0.0, 0.0, -0.014), (0.21, 0.05, 0.028))                # guard bar, across the blade's width
_h.box((0.0, 0.0, -0.034), (0.06, 0.036, 0.016))               # ferrule under the guard
barrel(_h, (0.0, 0.0, -GRIP * 0.5 - 0.03), 0.019, GRIP, seg=8, axis='z', r2=0.023)
barrel(_h, (0.0, 0.0, -GRIP - 0.045), 0.030, 0.030, seg=8, axis='z')   # pommel
_h.emit()

# ── the foe: a shoulder line and a head, standing on the ground plane. Nothing more, on purpose —
#    what you READ is the blade, and a detailed body would compete with the one thing the player
#    has to look at. It is a SILHOUETTE, which is also the only thing that survives being unlit.
_f = kit.Part('foe')
_f.box((0.0, 0.0, 0.62), (0.46, 0.24, 0.66))                   # torso
_f.box((0.0, 0.0, 0.99), (0.40, 0.22, 0.10))                   # shoulder line — the read
barrel(_f, (0.0, 0.0, 1.10), 0.115, 0.22, seg=10, axis='z')    # head
_f.box((0.30, 0.0, 0.80), (0.13, 0.13, 0.44), rz=0.30)         # sword arm, raised
_f.box((-0.27, 0.0, 0.70), (0.12, 0.12, 0.40))                 # off arm
_f.box((0.11, 0.0, 0.16), (0.15, 0.16, 0.34))                  # legs, just enough to stand on
_f.box((-0.11, 0.0, 0.16), (0.15, 0.16, 0.34))
_f.emit()

# ── the ground: a disc, because a square floor gives the camera a corner to find and this fight
#    has no walls. Thin, so it reads as a mark on black rather than a slab.
kit.Part('ground').cyl((0.0, 0.0, -0.02), 7.0, 0.04, 48).emit()

# ── self-check, printed so the runner can assert it rather than trust it. The grip origin is the
#    load-bearing one: every arc in this game is drawn by rotating the blade NODE, so an origin at
#    the blade's middle would swing it like a propeller and look wrong in a way no name check sees.
for nm in ('blade_light', 'blade_dark'):
    ob = bpy.data.objects[nm]
    zs = [v.co.z for v in ob.data.vertices]
    print('CHECK %s origin_z=%.4f length=%.4f' % (nm, min(zs), max(zs) - min(zs)))

kit.export_glb(OUT)
print('wrote', OUT)

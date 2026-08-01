# upperdeckripmaster3030 — ARCHITECTURAL kit: the primitives kit.py deliberately does not have.
#
# kit.py is a BOX kit. That was the right first move — a level is a floor plan before it is
# anything — but it is also, literally, why the arenas read as a box world: every solid in
# `build-level.py` and in the six hand-built maps is an axis-aligned box, so every silhouette in
# frame is made of the same four right angles and the eye stops finding anything to look at.
# This module is the answer to that: round columns, arches, swept mouldings, chamfered masses,
# balusters, foliage. Same rules as kit.py — every triangle is generated here, so it is
# unambiguously our own work (models/README.md), and a level is still its script plus a seed.
#
# ── conventions, and they are NOT kit.py's ──────────────────────────────────────────────────
# kit.py authors in Blender's native Z-up and lets the OBJ exporter rotate the result. That is
# fine for a level laid out from scratch, and it is a menace when the level you are rebuilding
# already exists in GAME coordinates: `js/s9pc-game.js`'s LIDO DECK is written in (x, z) with y
# up, `MAP.spawns` is `[x, z, y]`, and every number in that file would have to be flipped in the
# head to get here. One flipped sign in forty is a corner tower on the wrong side of the arena.
#
# So EVERY function in this module takes GAME coordinates: `(x, z, y)`, y up, exactly the order
# `MAP.spawns` uses. The conversion is one line — `blender = (x, -z, y)` — and it is applied in
# exactly one place, `GPart.gv()`.
#
# ⚑ That conversion is a PROPER ROTATION (det +1), and it is the exact inverse of what
#   `kit.export_obj()` does on the way out (game = (bx, bz, -by)). Author a coordinate here and
#   the identical number comes back out of `bake-world.mjs`, modulo the bake's scale and
#   recentre — which is what makes the level verifiable against the hand-built map it replaces
#   rather than merely plausible. It also means winding survives: "counter-clockwise seen from
#   outside" is preserved by any rotation, so the rule is the same rule kit.py follows.
#
# ⚑ WINDING IS CHECKED, NOT ASSUMED. Getting a face order wrong on a swept moulding is invisible
#   in Blender (which shades two-sided) and fatal in the game: `bake-world.mjs` derives every
#   normal from the triangle's own winding, and PlayCanvas culls by it, so an inside-out part
#   simply is not there — which reads as "the geometry didn't load", not as a lighting bug.
#   Every primitive below is built into a scratch Part, its signed volume measured, and the faces
#   reversed if it came out negative. Auto-fixing is safe here because every primitive is a
#   CLOSED solid; `report()` prints what needed flipping so a real modelling error still surfaces
#   instead of being silently laundered.
#
# ⚑ ONE PART = ONE COLLISION AABB, same as kit.py. A balustrade is authored as one Part on
#   purpose: 26 balusters as 26 objects would be 26 boxes with walk-through gaps between them,
#   which is not what a balustrade is. A parasol is authored as TWO Parts on purpose: pole and
#   canopy in one Part would put a 4.8 m invisible box around a 0.3 m pole at ankle height.

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Part, spawn as _kit_spawn                                        # noqa: E402

TAU = math.tau
FLIPPED = []                     # parts whose winding had to be reversed — printed by report()


# ══ core ════════════════════════════════════════════════════════════════════════════════════
class GPart(Part):
    """A kit.Part whose vertices are given in GAME space: (x, z, y), y up.

    Everything else — `emit()`, the one-object-one-AABB contract — is kit.Part's.
    """

    def gv(self, x, z, y):
        self.v.append((x, -z, y))
        return len(self.v) - 1


def _volume(v, f):
    """Signed volume of a closed mesh. Positive when faces wind counter-clockwise from outside.

    Fan-triangulates each n-gon, which is exactly what bake-world.mjs does when it reads the OBJ,
    so this measures the winding the GAME will see rather than the one Blender happens to store.
    """
    tot = 0.0
    for face in f:
        a = v[face[0]]
        for i in range(1, len(face) - 1):
            b, c = v[face[i]], v[face[i + 1]]
            tot += (a[0] * (b[1] * c[2] - b[2] * c[1])
                    - a[1] * (b[0] * c[2] - b[2] * c[0])
                    + a[2] * (b[0] * c[1] - b[1] * c[0]))
    return tot / 6.0


def _merge(dst, src, label):
    """Orientation-check `src` and append it into `dst`.

    Every primitive builds into its own scratch Part and merges through here, so a Part that
    holds several solids (a balustrade = plinth + 26 balusters + handrail) cannot end up with
    some of them inside-out. Checking the composite instead would only measure the SUM of the
    volumes and would happily pass a part with one reversed baluster in it.
    """
    vol = _volume(src.v, src.f)
    if vol < 0:
        src.f = [tuple(reversed(face)) for face in src.f]
        FLIPPED.append(label)
    base = len(dst.v)
    dst.v.extend(src.v)
    dst.f.extend(tuple(i + base for i in face) for face in src.f)
    return dst


def report():
    """One line per primitive whose winding needed reversing. Should print nothing."""
    if FLIPPED:
        seen = sorted(set(FLIPPED))
        print('WINDING auto-reversed %d part(s): %s' % (len(FLIPPED), ', '.join(seen[:12])))
    return len(FLIPPED)


# ══ plans — a horizontal cross-section, as a list of (x, z) ═════════════════════════════════
# All of them traverse in the SAME sense (from +x toward +z). prism() relies on it: mix two
# senses in one solid and half of it points inward.

def rect_plan(x0, z0, x1, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def octa_plan(x0, z0, x1, z1, ch):
    """A rectangle with its four vertical corners cut. THE workhorse of this module.

    A hard 90° edge with no chamfer is most of why a box reads as a box: a real edge catches a
    highlight along its length, and a mitre with zero width cannot. 3–8 cm is enough — this is
    about giving the key light a facet to sit on, not about making the shape visibly octagonal.
    """
    ch = min(ch, (x1 - x0) / 2.05, (z1 - z0) / 2.05)
    return [(x0 + ch, z0), (x1 - ch, z0), (x1, z0 + ch), (x1, z1 - ch),
            (x1 - ch, z1), (x0 + ch, z1), (x0, z1 - ch), (x0, z0 + ch)]


def circle_plan(cx, cz, r, seg, phase=0.0):
    return [(cx + math.cos(TAU * i / seg + phase) * r,
             cz + math.sin(TAU * i / seg + phase) * r) for i in range(seg)]


def round_rect_plan(x0, z0, x1, z1, r, corner_seg=5):
    """Rectangle with radiused corners — the pool, and the coping that follows it.

    A rectangular kerb is the single most box-like thing in a lido; the radius is what says
    "poured concrete" instead of "axis-aligned solid".
    """
    r = min(r, (x1 - x0) / 2.05, (z1 - z0) / 2.05)
    pts = []
    for (ccx, ccz, a0) in ((x1 - r, z0 + r, -math.pi / 2), (x1 - r, z1 - r, 0.0),
                           (x0 + r, z1 - r, math.pi / 2), (x0 + r, z0 + r, math.pi)):
        for k in range(corner_seg + 1):
            a = a0 + (math.pi / 2) * k / corner_seg
            pts.append((ccx + math.cos(a) * r, ccz + math.sin(a) * r))
    return pts


def rot_plan(plan, cx, cz, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * ca - (z - cz) * sa, cz + (x - cx) * sa + (z - cz) * ca)
            for (x, z) in plan]


def inset_plan(plan, cx, cz, d):
    """Scale a plan toward (cx, cz) by `d` metres of average radius — good enough for a cap
    chamfer on a convex plan, and it cannot self-intersect the way a true offset can."""
    rs = [math.hypot(x - cx, z - cz) for (x, z) in plan]
    k = max(0.02, (sum(rs) / len(rs) - d)) / max(1e-6, sum(rs) / len(rs))
    return [(cx + (x - cx) * k, cz + (z - cz) * k) for (x, z) in plan]


# ══ solids ══════════════════════════════════════════════════════════════════════════════════
def prism(dst, stations, cap_bottom=True, cap_top=True, label='prism'):
    """Loft a stack of same-length plans. Every closed solid in this module is one of these.

    `stations` = [(plan, y), ...] bottom → top.
    """
    p = GPart('_t')
    n = len(stations[0][0])
    idx = []
    for (plan, y) in stations:
        b = len(p.v)
        for (x, z) in plan:
            p.gv(x, z, y)
        idx.append(b)
    for k in range(len(idx) - 1):
        a, b = idx[k], idx[k + 1]
        for i in range(n):
            j = (i + 1) % n
            p.f.append((a + i, b + i, b + j, a + j))
    if cap_bottom:
        p.f.append(tuple(idx[0] + i for i in range(n)))
    if cap_top:
        p.f.append(tuple(idx[-1] + i for i in range(n - 1, -1, -1)))
    return _merge(dst, p, label)


def gbox(dst, c, s, ry=0.0, ch=0.0, top_ch=0.0):
    """Box in game space. `c`/`s` are (x, z, y) centre and full size; `ch` chamfers the four
    vertical edges, `top_ch` pulls the top face in as well."""
    x0, x1 = c[0] - s[0] / 2.0, c[0] + s[0] / 2.0
    z0, z1 = c[1] - s[1] / 2.0, c[1] + s[1] / 2.0
    y0, y1 = c[2] - s[2] / 2.0, c[2] + s[2] / 2.0
    plan = octa_plan(x0, z0, x1, z1, ch) if ch > 0 else rect_plan(x0, z0, x1, z1)
    if ry:
        plan = rot_plan(plan, c[0], c[1], ry)
    if top_ch > 0:
        return prism(dst, [(plan, y0), (plan, y1 - top_ch),
                           (inset_plan(plan, c[0], c[1], top_ch), y1)], label='box')
    return prism(dst, [(plan, y0), (plan, y1)], label='box')


def lathe(dst, cx, cz, rings, seg=12, phase=0.0, label='lathe'):
    """Turned solid of revolution. `rings` = [(y, radius), ...] bottom → top.

    Columns, balusters, planter tubs, parasol poles, finials — everything with a profile. The
    ring count is the tri budget: 12 segments is enough to stop reading as a prism at play
    distance, 6 is enough for something 9 cm across.
    """
    return prism(dst, [(circle_plan(cx, cz, max(r, 0.005), seg, phase), y) for (y, r) in rings],
                 label=label)


def extrude_x(dst, section, x0, x1, label='ext'):
    """Extrude a closed (z, y) section along x — mouldings, cornices, kerbs, treads, fascias.

    The section is the thing that makes a moulding a moulding: a cornice is a profile dragged
    along a line, and a box is that profile collapsed to a rectangle.
    """
    return _ext(dst, section, x0, x1, axis='x', label=label)


def extrude_z(dst, section, z0, z1, label='ext'):
    """Extrude a closed (x, y) section along z."""
    return _ext(dst, section, z0, z1, axis='z', label=label)


def _ext(dst, section, a0, a1, axis, label):
    p = GPart('_t')
    n = len(section)
    idx = []
    for a in (a0, a1):
        b = len(p.v)
        for (u, y) in section:
            p.gv(a, u, y) if axis == 'x' else p.gv(u, a, y)
        idx.append(b)
    # ⚠ The face order is the MIRROR of prism()'s, and it has to be. prism() stacks horizontal
    # plans and sweeps upward; this drags a vertical section sideways, which reverses the sense
    # of "outside". Built the other way round it emitted 90 inside-out parts on the first run of
    # LIDO — invisible in Blender (two-sided) and invisible in the .wld (normals come from the
    # winding, so they were consistently wrong), and it would have shown up in game as coping,
    # treads and wall copings that simply were not there.
    lo, hi = idx
    for i in range(n):
        j = (i + 1) % n
        p.f.append((lo + i, lo + j, hi + j, hi + i))
    p.f.append(tuple(lo + i for i in range(n - 1, -1, -1)))
    p.f.append(tuple(hi + i for i in range(n)))
    return _merge(dst, p, label)


def sweep(dst, path, profile, label='sweep'):
    """Sweep a closed 2-D `profile` along a closed horizontal `path`.

    `path` = [(x, z, nx, nz), ...] — a point and its OUTWARD horizontal unit normal.
    `profile` = [(out, up), ...] — offsets along that normal and in y.

    This is the pool coping: a bullnose section dragged round a radiused rectangle. Doing it as
    a sweep rather than as four boxes is the whole difference between a kerb and a lip.
    """
    p = GPart('_t')
    n = len(profile)
    idx = []
    for (x, z, nx, nz) in path:
        b = len(p.v)
        for (out, up) in profile:
            p.gv(x + nx * out, z + nz * out, up)
        idx.append(b)
    m = len(idx)
    for k in range(m):
        a, b = idx[k], idx[(k + 1) % m]
        for i in range(n):
            j = (i + 1) % n
            p.f.append((a + i, b + i, b + j, a + j))
    return _merge(dst, p, label)


def sweep_run(dst, path, profile, label='sweep'):
    """Sweep along an OPEN path and cap both ends — one segment of a longer moulding."""
    p = GPart('_t')
    n = len(profile)
    idx = []
    for (x, z, nx, nz) in path:
        b = len(p.v)
        for (out, up) in profile:
            p.gv(x + nx * out, z + nz * out, up)
        idx.append(b)
    for k in range(len(idx) - 1):
        a, b = idx[k], idx[k + 1]
        for i in range(n):
            j = (i + 1) % n
            p.f.append((a + i, b + i, b + j, a + j))
    p.f.append(tuple(idx[0] + i for i in range(n)))
    p.f.append(tuple(idx[-1] + i for i in range(n - 1, -1, -1)))
    return _merge(dst, p, label)


def sweep_chunks(name_fmt, path, profile, chunks):
    """Emit a CLOSED sweep as `chunks` separate objects, each capped and overlapping by one
    station so there is no seam.

    ⚑ This is a collision decision, not a modelling one. One Part is one AABB (see kit.py), so
      sweeping a pool coping as a single ring would hand the collider a box spanning the whole
      pool — the player would walk across the water on an invisible lid at coping height.
      Chunking keeps each AABB on its own arc, which is why the count is a parameter.
    """
    m = len(path)
    per = max(2, int(math.ceil(m / float(chunks))))
    out, k, i = [], 0, 0
    while i < m:
        seg = [path[(i + j) % m] for j in range(min(per, m - i) + 1)]
        p = GPart(name_fmt % k)
        sweep_run(p, seg, profile, 'coping')
        out.append(p.emit())
        k += 1
        i += per
    return out


def path_from_plan(plan):
    """Turn a closed plan into a sweep path, deriving each point's outward normal from its
    neighbours. Averaging the two adjacent edge normals keeps a radiused corner smooth instead of
    mitre-jointed, which is the point of having radiused it."""
    out = []
    m = len(plan)
    for i in range(m):
        px, pz = plan[(i - 1) % m]
        cx, cz = plan[i]
        nx2, nz2 = plan[(i + 1) % m]
        n = []
        for (ax, az, bx, bz) in ((px, pz, cx, cz), (cx, cz, nx2, nz2)):
            dx, dz = bx - ax, bz - az
            L = math.hypot(dx, dz) or 1.0
            n.append((dz / L, -dx / L))                      # right-hand normal of the traverse
        ox, oz = (n[0][0] + n[1][0]), (n[0][1] + n[1][1])
        L = math.hypot(ox, oz) or 1.0
        out.append((cx, cz, ox / L, oz / L))
    return out


def arch(dst, x0, x1, zc, dz, y_spring, band, seg=9, label='arch'):
    """A semicircular voussoir band spanning x0..x1 in a wall lying at z = zc.

    ⚠ Placement is a COLLISION decision as much as a visual one. One Part is one AABB, and an
    arch's AABB spans the opening it is arching over — so an arch springing at head height would
    wall the colonnade off. `js/s9pc-game.js` blocks on `b.y1 > e.y + STEP && b.y0 < e.y + h`, so
    an arch whose springing sits above ~2.7 m over the standing surface is scenery you walk
    under, which is what an arcade is supposed to be.
    """
    p = GPart('_t')
    cx = (x0 + x1) / 2.0
    r_in = (x1 - x0) / 2.0
    r_out = r_in + band
    z_lo, z_hi = zc - dz / 2.0, zc + dz / 2.0
    idx = []
    for k in range(seg + 1):
        a = math.pi * k / seg
        ci, si = math.cos(a), math.sin(a)
        b = len(p.v)
        p.gv(cx + r_in * ci, z_lo, y_spring + r_in * si)
        p.gv(cx + r_out * ci, z_lo, y_spring + r_out * si)
        p.gv(cx + r_out * ci, z_hi, y_spring + r_out * si)
        p.gv(cx + r_in * ci, z_hi, y_spring + r_in * si)
        idx.append(b)
    for k in range(seg):
        a, b = idx[k], idx[k + 1]
        for i in range(4):
            j = (i + 1) % 4
            p.f.append((a + i, b + i, b + j, a + j))
    p.f.append(tuple(idx[0] + i for i in range(4)))
    p.f.append(tuple(idx[-1] + i for i in range(3, -1, -1)))
    return _merge(dst, p, label)


def blob(dst, cx, cz, y0, r, h, seg=5, phase=0.0, label='blob'):
    """A squat low-poly dome — one clipped-shrub clump. Four of these in a tub read as planting;
    a green box does not, and planting is half of what makes a lido a place rather than a yard.

    Three stations at five segments = 26 triangles. The phase offset is what does the work: four
    identical domes read as four identical domes, four rotated ones read as a shrub.
    """
    return lathe(dst, cx, cz, [(y0, r * 0.58), (y0 + h * 0.52, r), (y0 + h, r * 0.16)],
                 seg=seg, phase=phase, label=label)


# ══ composites ══════════════════════════════════════════════════════════════════════════════
def column(name, x, z, y0, height, r=0.42, seg=14, plinth=True):
    """A real column: square plinth, moulded base, entasised shaft, flared capital, abacus.

    A cylinder alone still reads as a post. What says "column" is that the shaft is not a
    constant radius and that it lands on something square — the transitions are where the light
    breaks.
    """
    p = GPart(name)
    y = y0
    if plinth:
        gbox(p, (x, z, y + 0.16), (r * 3.1, r * 3.1, 0.32), ch=0.05)
        y += 0.32
    lathe(p, x, z, [(y, r * 1.34), (y + 0.10, r * 1.34), (y + 0.20, r * 1.16),
                    (y + 0.30, r * 1.06)], seg=seg, label='col_base')
    sh0, sh1 = y + 0.30, y0 + height - 0.46
    lathe(p, x, z, [(sh0, r * 1.02), (sh0 + (sh1 - sh0) * 0.34, r),
                    (sh0 + (sh1 - sh0) * 0.72, r * 0.94), (sh1, r * 0.87)], seg=seg, label='shaft')
    lathe(p, x, z, [(sh1, r * 0.90), (sh1 + 0.16, r * 1.10), (sh1 + 0.28, r * 1.24)],
          seg=seg, label='capital')
    gbox(p, (x, z, sh1 + 0.37), (r * 2.9, r * 2.9, 0.18), ch=0.04)
    return p.emit()


def baluster(dst, x, z, y0, height, r=0.058, seg=5, label='balus'):
    """One turned baluster — vase profile, so the run has a rhythm instead of a picket fence.

    ⚑ FIVE stations and FIVE radial segments, measured against the budget rather than chosen.
      The first pass used nine and six (104 tris each): four balustrade runs then cost 4,976
      triangles, a fifth of the whole level, to draw something 11 cm across. At 46 tris the vase
      silhouette survives — it is the WAIST that reads at play distance, not the facet count —
      and the four runs cost 2,424.
    """
    h = height
    return lathe(dst, x, z, [
        (y0, r * 1.50), (y0 + h * 0.14, r * 1.00), (y0 + h * 0.34, r * 1.55),
        (y0 + h * 0.70, r * 0.72), (y0 + h, r * 1.30),
    ], seg=seg, label=label)


def balustrade(name, x0, z0, x1, z1, y0, height=1.10, spacing=0.62, thick=0.30):
    """Plinth + individual balusters + a moulded handrail, as ONE Part.

    One Part because a balustrade is one barrier: as separate objects the AABBs would leave
    walk-through gaps at exactly baluster pitch, and a player squeezing between two balusters is
    the sort of thing that reads as the level being broken.
    """
    p = GPart(name)
    dx, dz = x1 - x0, z1 - z0
    L = math.hypot(dx, dz) or 1.0
    # axis-aligned only — every run in this arena is, and a rotated run would need its plinth and
    # handrail rotated too, which is three more chances to get a sign wrong for no visible gain
    along_x = abs(dx) >= abs(dz)
    sx = (L, thick) if along_x else (thick, L)
    cx, cz = (x0 + x1) / 2.0, (z0 + z1) / 2.0
    gbox(p, (cx, cz, y0 + 0.09), (sx[0], sx[1], 0.18), ch=0.03)               # plinth
    n = max(2, int(L / spacing))
    for i in range(n):
        t = (i + 0.5) / n
        baluster(p, x0 + dx * t, z0 + dz * t, y0 + 0.18, height - 0.32)
    top = y0 + height - 0.14
    wide = (L, thick + 0.10) if along_x else (thick + 0.10, L)
    narrow = (L, thick + 0.04) if along_x else (thick + 0.04, L)
    gbox(p, (cx, cz, top + 0.05), (wide[0], wide[1], 0.10), ch=0.03)          # handrail, moulded
    gbox(p, (cx, cz, top + 0.13), (narrow[0], narrow[1], 0.09), ch=0.035, top_ch=0.03)
    return p.emit()


def nosed_tread(name, x0, z0, x1, z1, y_top, rise, front, nose=0.05):
    """One step, with a bullnose. `front` is the exposed edge: '+x', '-x', '+z' or '-z'.

    A staircase is a run of separate objects (kit.stairs's rule — you walk UP it rather than into
    a ramp-shaped box); the nosing is what makes each tread findable in a frame instead of a
    stack of grey slabs.
    """
    p = GPart(name)
    x0, x1 = min(x0, x1), max(x0, x1)
    z0, z1 = min(z0, z1), max(z0, z1)
    y0 = y_top - rise
    r = 0.055
    cy = y_top - r
    if front in ('+x', '-x'):
        sgn = 1.0 if front == '+x' else -1.0
        edge = x1 if sgn > 0 else x0
        _ext(p, [(z0, y0), (z1, y0), (z1, y_top), (z0, y_top)], x0, x1, axis='x', label='tread')
        # the nosing: a lip projecting past the riser, so the tread edge catches the key light
        _ext(p, [(z0, cy - r), (z1, cy - r), (z1, cy + r * 0.4), (z0, cy + r * 0.4)],
             min(edge, edge + sgn * nose), max(edge, edge + sgn * nose), axis='x', label='nose')
    else:
        sgn = 1.0 if front == '+z' else -1.0
        edge = z1 if sgn > 0 else z0
        _ext(p, [(x0, y0), (x1, y0), (x1, y_top), (x0, y_top)], z0, z1, axis='z', label='tread')
        _ext(p, [(x0, cy - r), (x1, cy - r), (x1, cy + r * 0.4), (x0, cy + r * 0.4)],
             min(edge, edge + sgn * nose), max(edge, edge + sgn * nose), axis='z', label='nose')
    return p.emit()


def flight(name, x0, z0, x1, z1, y_bottom, y_top, steps, front, run_axis='x', y_base=None):
    """A run of nosed treads climbing from y_bottom to y_top. Each tread is its own object.

    `run_axis` is the axis the flight climbs along; the treads span the other one. Every riser is
    `(y_top - y_bottom) / steps`, so sizing a flight is a matter of picking a rise the player's
    0.62 m step height can take rather than of counting boxes.

    Each tread is SOLID down to `y_base` (kit.stairs's shape), not a floating slab — a flight of
    hovering treads is a flight you can shoot and walk through.
    """
    out = []
    y_base = y_bottom if y_base is None else y_base
    rise = (y_top - y_bottom) / steps
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        top = y_bottom + rise * (i + 1)
        if run_axis == 'x':
            out.append(nosed_tread('%s_step%02d' % (name, i),
                                   x0 + (x1 - x0) * t0, z0, x0 + (x1 - x0) * t1, z1,
                                   top, top - y_base, front))
        else:
            out.append(nosed_tread('%s_step%02d' % (name, i),
                                   x0, z0 + (z1 - z0) * t0, x1, z0 + (z1 - z0) * t1,
                                   top, top - y_base, front))
    return out


def parasol(name, x, z, y0, pole_h=3.05, canopy_r=2.35, gores=8):
    """Tapered pole + segmented canopy, as TWO objects.

    Two because of collision: one Part would put a 4.7 m box round a 0.16 m pole at ankle height,
    and the arena would have four invisible rooms in it. The canopy's own AABB sits at head
    height, where `blocksE` never sees it.
    """
    pole = GPart(name + '_pole')
    lathe(pole, x, z, [(y0, 0.13), (y0 + 0.06, 0.10), (y0 + pole_h * 0.5, 0.075),
                       (y0 + pole_h, 0.058)], seg=8, label='umb_pole')
    pole.emit()
    cap = GPart(name + '_top')
    top = y0 + pole_h
    # A segmented canopy, stations ordered BOTTOM → TOP. ⚠ prism() lofts upward, so a ring list
    # written crown-first comes out with negative volume and every face pointing inward; the
    # winding check caught exactly this on the first LIDO build, along with the hut valances.
    lathe(cap, x, z, [(top - 0.14, canopy_r), (top - 0.02, canopy_r * 0.92),
                      (top + 0.16, canopy_r * 0.55), (top + 0.30, 0.10)],
          seg=gores, label='umb_canopy')
    for k in range(6):                                             # ribs, so the gores read
        a = TAU * (k + 0.5) / 6
        gbox(cap, (x + math.cos(a) * canopy_r * 0.55, z + math.sin(a) * canopy_r * 0.55,
                   top - 0.02), (canopy_r * 0.9, 0.05, 0.05), ry=a)
    lathe(cap, x, z, [(top + 0.30, 0.045), (top + 0.44, 0.055), (top + 0.52, 0.02)],
          seg=5, label='finial')
    cap.emit()
    return pole, cap


def lounger(name, x, z, y0, ry=0.0):
    """A sunbed. Deliberately ≤0.58 m tall in ONE Part: `js/s9pc-game.js` only blocks on solids
    whose top clears `e.y + 0.62`, so at this height it is clutter you walk over rather than a
    knee-high wall that stops you dead — which is the difference between a lido and an obstacle
    course."""
    p = GPart(name)
    L, W = 1.95, 0.72
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx, lz = sx * (L / 2 - 0.16), sz * (W / 2 - 0.10)
            cxx = x + lx * math.cos(ry) - lz * math.sin(ry)
            czz = z + lx * math.sin(ry) + lz * math.cos(ry)
            lathe(p, cxx, czz, [(y0, 0.035), (y0 + 0.26, 0.030)], seg=4, label='lng_leg')
    gbox(p, (x, z, y0 + 0.30), (L, W, 0.10), ry=ry, ch=0.04, top_ch=0.02)
    # the reclined back — two thinning slats, so the silhouette is a recline and not a slab
    for k in range(2):
        off = 0.56 + k * 0.24
        cxx = x + off * math.cos(ry)
        czz = z + off * math.sin(ry)
        gbox(p, (cxx, czz, y0 + 0.37 + k * 0.09), (0.22, W * 0.94, 0.08), ry=ry)
    return p.emit()


def planter(name, x, z, y0, r=1.35, seg=8, h=0.78):
    """A moulded tub — the pot, as one object."""
    p = GPart(name)
    lathe(p, x, z, [(y0, r * 0.74), (y0 + h * 0.55, r * 0.96), (y0 + h - 0.12, r),
                    (y0 + h - 0.08, r * 1.09), (y0 + h, r * 1.06)], seg=seg, label='tub')
    return p.emit()


def foliage(name, x, z, y0, r=1.15, rnd=None, clumps=5):
    """Planting, as its own object so it can carry the `plant` material.

    Its AABB is the crown, which is chest-high and therefore real cover — same as the hand-built
    LIDO DECK's green box, only now with a silhouette.
    """
    p = GPart(name)
    import random as _r
    R = rnd or _r.Random(7)
    for k in range(clumps):
        a = TAU * k / clumps + R.uniform(-0.25, 0.25)
        d = r * (0.0 if k == 0 else R.uniform(0.36, 0.62))
        rr = r * (0.62 if k == 0 else R.uniform(0.40, 0.55))
        hh = R.uniform(0.55, 0.95) * (1.25 if k == 0 else 1.0)
        blob(p, x + math.cos(a) * d, z + math.sin(a) * d, y0 - 0.10, rr, hh,
             seg=6, phase=R.uniform(0, 1.0))
    return p.emit()


def cabana(name, top_name, x, z, y0, w=4.2, d=3.2, h=2.42, ry=0.0):
    """A changing hut: chamfered body + corner posts, and a separate scalloped canopy.

    Two objects for the same reason a parasol is two — the canopy oversails the body, and one
    AABB round both would push the hut's footprint half a metre out on every side.
    """
    body = GPart(name)
    gbox(body, (x, z, y0 + 0.09), (w + 0.24, d + 0.24, 0.18), ry=ry, ch=0.06)      # plinth
    gbox(body, (x, z, y0 + h / 2 + 0.18), (w, d, h), ry=ry, ch=0.10)
    for sx in (-1, 1):                                                            # corner posts
        for sz in (-1, 1):
            lx, lz = sx * w / 2, sz * d / 2
            cxx = x + lx * math.cos(ry) - lz * math.sin(ry)
            czz = z + lx * math.sin(ry) + lz * math.cos(ry)
            lathe(body, cxx, czz, [(y0 + 0.18, 0.10), (y0 + h + 0.18, 0.085)], seg=6, label='hut_post')
    body.emit()
    top = GPart(top_name)
    ridge = y0 + h + 0.18
    gbox(top, (x, z, ridge + 0.12), (w + 1.0, d + 0.9, 0.24), ry=ry, ch=0.12, top_ch=0.10)
    # scalloped valance along the two long eaves — bottom-to-top ring order, see parasol()
    for k in range(4):
        t = (k + 0.5) / 4 - 0.5
        for sz in (-1, 1):
            lx, lz = t * (w + 1.0), sz * (d + 0.9) / 2
            cxx = x + lx * math.cos(ry) - lz * math.sin(ry)
            czz = z + lx * math.sin(ry) + lz * math.cos(ry)
            lathe(top, cxx, czz, [(ridge - 0.17, 0.05), (ridge + 0.02, 0.135)],
                  seg=5, label='valance')
    top.emit()
    return body, top


def gspawn(name, x, z, y):
    """Authored spawn, in the same (x, z, y) order `MAP.spawns` uses."""
    return _kit_spawn(name, (x, -z, y))

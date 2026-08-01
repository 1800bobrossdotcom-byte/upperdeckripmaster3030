# ripmaster3030studios — the landing page's hero wordmark, as HOT-STAMPED HOLOGRAPHIC FOIL.
#
#   blender --background --factory-startup -noaudio -P scripts/blender/build-hero-type.py \
#           -- media/hero build/hero-type/anton.ttf
#   (or just: npm run herotype, which also decompresses the font and measures the result)
#
# ⛔ V1 OF THIS FILE SHIPPED AND WAS REJECTED: "basic bitch geometry and fx". It was right.
#   V1 was a default extrude — one uniform round bevel, straight pull-back — carrying the CSS
#   gradient BAKED ONTO THE FACE AS FLAT PAINT. A painted gradient is not foil. Foil's entire
#   character is that THE HUE MOVES WHEN YOU MOVE, and nothing in v1 responded to view at all.
#   Everything below exists to fix one of those two failures.
#
# WHAT COMES OUT (five files):
#
#     media/hero/type.glb              THREE objects — `wm_face`, `wm_bevel`, `wm_rim`
#     media/hero/type-albedo.webp      the site's own gradient as the foil's base ink
#     media/hero/type-normal.webp      pressed-foil relief, BRUSHED along a swirling direction
#     media/hero/type-foil.webp        DATA: r = brush angle · g = grating phase · b = flake
#     media/hero/type-spectrum.png     the site palette made CYCLIC — the diffraction LUT
#
# ⚑ WE BAKE THE INPUTS, NOT THE LOOK. That is the whole architecture, and it is forced by a
#   measured constraint: EEVEE cannot run in this container (no libEGL) and Cycles on CPU took
#   133 s for one 640x360 frame, so anything rendered is hours. A Cycles BAKE of DIFFUSE-COLOR /
#   NORMAL / EMIT at 1 sample is a shader evaluation rather than light transport and costs about
#   a second each. But a bake is also, by definition, a fixed viewpoint — and a fixed viewpoint
#   is exactly what killed v1. So nothing view-dependent is baked. What ships is the SURFACE:
#   which way the brush runs, where the grating's phase sits, where the flakes are, what colour
#   the ink is. js/hero3d.js does the diffraction, the thin film and the anisotropy live, per
#   pixel, per frame, against the real view vector.
#
# ⚑ THE DIFFRACTION PALETTE IS THE SITE'S OWN GRADIENT, MADE CYCLIC. This is the idea the whole
#   thing turns on. A rainbow foil that walks through arbitrary hues would stop being this
#   studio's wordmark the moment it moved. So `type-spectrum.png` is the six CSS stops
#   (#eafff2 #2bff80 #27f7e4 #7aa8ff #ff2ad9 #ffd23b) wrapped end-to-end into a loop, and the
#   shader's grating phase indexes THAT. At rest the phase is just the vertical position, so the
#   word reads as the gradient it has always been; tilt it and the gradient SLIDES through the
#   letters. The hue can move as far as you like and every colour it lands on is a site colour.
#
# ⚑ THE EDGE IS A DIE, NOT A FILLET. Blender's `bevel_mode='PROFILE'` takes a hand-authored
#   cross-section (see DIES below) instead of a quarter circle: a narrow flat LAND at the face
#   edge that catches a hard specular line, a long chamfer, a SHELF, then a steep roll into the
#   wall. Three variants are dealt out across the word, because one constant profile repeated
#   twenty times is what reads as CAD. A quarter circle has a monotone, evenly-spaced set of
#   facet angles; these do not, and scripts/build-hero-type.mjs asserts that difference rather
#   than trusting it.
#
# ⚑ THREE OBJECTS, SPLIT BY FACE NORMAL — v1 had two, and the third is where the prism lives.
#   The UV is a PLANAR projection of the wordmark's bounding box, the only projection that lets
#   one continuous ramp run through every letter the way `background-clip:text` does. It is
#   DEGENERATE on the extrusion walls (their UV area collapses to a line), so those are their own
#   object with no UVs and a procedural metal in the browser. But the middle band — the chamfer —
#   is neither: its UV is merely stretched, and it is the part of a foil stamp that breaks light
#   into colour. Splitting it out lets it run the same shader with the grating frequency and the
#   fresnel sheen pushed hard, which is what puts a prism on every letter edge.
#        n.z  >= 0.90            -> wm_face    (flat face + the die's land)
#       0.30 <=  n.z  < 0.90     -> wm_bevel   (the chamfer and the shelf)
#       |n.z| <  0.30            -> wm_rim     (the wall — no UVs)
#        n.z  <= -0.30           -> DROPPED    (see below)
#
# ⚑ THE BACK HALF IS NOT EXPORTED, and that is what pays for the die. Blender applies a bevel
#   profile to BOTH ends of an extrusion, so the richer edge doubled the triangle count to
#   14,352 — over this file's budget for a decoration above the fold. But the wordmark turns at
#   most ~16° and is backed by the page: the rear cap and the rear chamfer are never on screen
#   for one frame. Culling them by SIGNED normal (rather than by a z threshold) is exact, needs
#   no per-glyph plane, and leaves the walls untouched — they are the silhouette. 14,352 -> 7,776.
#
# ⚑ THE WORD IS SET CHARACTER BY CHARACTER so that depth can VARY ACROSS IT. Each glyph gets its
#   own extrude depth (deterministic +/-22% jitter, so the back of the stamp is ragged the way a
#   real one is) and its own die profile, and the whole word is DOMED — pushed forward in the
#   middle on a smooth arc, like foil laid over a slightly proud plate. Head on none of that is
#   visible; the moment it turns, the letters stop being one flat slab.
#   ⚠ Setting characters separately would normally throw away the font's kerning. It does not
#     here, because the gaps are MEASURED the same way v1 measured its three run junctions —
#     `natural_gap` sets the pair as one run and subtracts the two ink widths, which is exactly
#     the kern. A made-up constant would put the letters visibly adrift at one size only.
#
# ⚠ BRIGHTNESS RUNS THE OPPOSITE WAY FROM THE BACKGROUND. build-bg.mjs fails a plate that is too
#   BRIGHT, because paragraphs sit on it. This one fails if it is too DARK: nothing sits on the
#   wordmark, it is the brightest thing above the fold, and a dim foil reads as a rendering bug.
#
# Everything is procedural: no external image is sampled, and the only third-party input is the
# repo's own OFL-licensed Anton, used to generate outlines (which OFL expressly permits).

import sys
import os
import math

import bpy                                                                       # noqa: E402

FMT = os.environ.get('HERO_FMT', 'WEBP')
EXT = 'webp' if FMT == 'WEBP' else 'png'
QUALITY = int(os.environ.get('HERO_QUALITY', '82'))
# ⚠ The foil map is DATA (a direction, a phase, a mask) and lossy blocking in a direction channel
#   shows up as the brush snapping between angles. Its own, higher quality.
FOIL_QUALITY = int(os.environ.get('HERO_FOIL_QUALITY', '92'))
TEX_W = int(os.environ.get('HERO_TEX_W', '1024'))
LUT_W = 256

# ⚑ The word is set in three runs because the CSS is: `.sm` puts `3030` at 0.62em on the same
#   baseline. The runs survive only as a SIZE and a kerning-context boundary now; the glyphs
#   themselves are placed one at a time (see build_type).
RUNS = [('RIPMASTER', 1.00), ('3030', 0.62), ('STUDIOS', 1.00)]

EXTRUDE = 0.055          # half-depth, in units where the cap height is ~0.516
EXTRUDE_JITTER = 0.22    # per-character, deterministic — the ragged back of a hand-set stamp
DOME = 0.75              # forward bow at the centre of the word, in units of EXTRUDE
BEVEL = 0.018            # die width. v1's 0.013 round bevel was a fillet; this is a shoulder.
CURVE_RES = 2            # outline subdivision; 2 holds Anton's curves and halves the vertex count
FACE_NZ = 0.90           # normal.z at or above this is the FACE (flat + the die's land)
BEVEL_NZ = 0.30          # ... down to here is the CHAMFER; |n.z| below it is the wall

# ── the dies ────────────────────────────────────────────────────────────────────────────────
# A curve bevel profile runs from (1, 0) — full radial offset, no depth, i.e. where the chamfer
# meets the WALL — to (0, 1), the face plane. Both axes are scaled by BEVEL, so x and y are in
# the same units and a segment's |n.z| is exactly |dx| / length. Listed face-first for reading;
# they are handed to Blender in whatever order (CurveProfile sorts by x itself).
#
# Every path from (0,1) to (1,0) has a length-weighted mean angle of 45°, so a die cannot be
# monotonically steepening — what distinguishes these from a quarter circle is WHERE the angle
# is spent: a nearly-flat land first, then most of the travel in one straight chamfer, then a
# shelf that flattens back out before the final roll. That non-monotonicity is the tell of a
# stamped edge, and it is what the facet-angle assertion in build-hero-type.mjs looks for.
DIES = [
    # land           chamfer        shelf          roll
    [(0.14, 0.96), (0.55, 0.55), (0.72, 0.44), (0.88, 0.18)],   # |n.z| .96 .71 .84 .52 .55
    [(0.09, 0.98), (0.46, 0.62), (0.68, 0.53), (0.86, 0.22)],   # narrower land, higher shelf
    [(0.19, 0.94), (0.61, 0.49), (0.75, 0.41), (0.90, 0.15)],   # wider land, tighter roll
]

# the CSS wordmark gradient, top -> bottom, as (position, sRGB hex)
RAMP = [(0.04, '#eafff2'), (0.24, '#2bff80'), (0.46, '#27f7e4'),
        (0.60, '#7aa8ff'), (0.80, '#ff2ad9'), (0.96, '#ffd23b')]


def srgb_to_linear(c):
    """Blender works linear; CSS hex is sRGB. Skipping this is a stop of wash on the accents."""
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def linear_to_srgb(c):
    return tuple(12.92 * x if x <= 0.0031308 else 1.055 * (x ** (1 / 2.4)) - 0.055 for x in c)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def node(nt, kind, loc=(0, 0), **kw):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in kw.items():
        if hasattr(n, k):
            setattr(n, k, v)
    return n


def hash01(i, salt=0):
    """A deterministic 0..1 from an integer. Same word, same stamp, every build — a wordmark
    that reshuffled its letter depths on every rebuild would make every visual diff useless."""
    x = (i * 2654435761 + salt * 40503 + 12345) & 0xFFFFFFFF
    x ^= x >> 15
    x = (x * 2246822519) & 0xFFFFFFFF
    x ^= x >> 13
    return ((x * 3266489917) & 0xFFFFFFFF) / 4294967296.0


# ── the type ────────────────────────────────────────────────────────────────────────────────

def _text_curve(fnt, body, size, res=CURVE_RES, solid=True, extrude=EXTRUDE, die=None):
    cu = bpy.data.curves.new(body + '_c', 'FONT')
    cu.body = body
    cu.font = fnt
    cu.size = size
    cu.align_x = 'LEFT'
    cu.align_y = 'BOTTOM_BASELINE'
    cu.resolution_u = res
    if solid:
        cu.extrude = extrude
        cu.bevel_depth = BEVEL
        if die is not None and hasattr(cu, 'bevel_mode'):
            cu.bevel_mode = 'PROFILE'
            prof = cu.bevel_profile
            for (px, py) in die:
                prof.points.add(px, py)
            # VECTOR handles: the die's facets are FLAT, and a smoothed profile is a fillet again
            for pt in prof.points:
                for attr in ('handle_type_1', 'handle_type_2'):
                    if hasattr(pt, attr):
                        setattr(pt, attr, 'VECTOR')
            prof.update()
        else:
            cu.bevel_resolution = 2
    return cu


def _eval_mesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    obe = ob.evaluated_get(dg)
    return obe, obe.to_mesh()


_SPAN = {}


def ink_span(fnt, body, size):
    """Ink extent of a run: (width, left edge). Blender gives no advance width, only geometry,
    which is exactly what we want — the layout below is optical, not metric."""
    key = (body, round(size, 6))
    if key in _SPAN:
        return _SPAN[key]
    cu = _text_curve(fnt, body, size, res=1, solid=False)
    ob = bpy.data.objects.new('probe', cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.update()
    obe, me = _eval_mesh(ob)
    xs = [v.co.x for v in me.vertices]
    span = (max(xs) - min(xs), min(xs)) if xs else (0.0, 0.0)
    obe.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    _SPAN[key] = span
    return span


def natural_gap(fnt, a, b):
    """The font's OWN gap at the a|b junction: set `ab` as one run and subtract the two ink
    widths. Setting the glyphs separately loses their side bearings AND their kern, and a
    made-up constant would put the letters visibly adrift at exactly one size."""
    return ink_span(fnt, a + b, 1.0)[0] - ink_span(fnt, a, 1.0)[0] - ink_span(fnt, b, 1.0)[0]


def build_type(font_path):
    """Returns (verts, face/bevel/rim polygon groups, bounds, stats) in AUTHORED coordinates:
    +x right, +y up, +z out."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fnt = bpy.data.fonts.load(font_path)

    chars = [(ch, size, ri) for ri, (body, size) in enumerate(RUNS) for ch in body]

    # pass 1 — place every glyph, measuring the font's own gap at each junction
    place, cursor = [], 0.0
    for i, (ch, size, ri) in enumerate(chars):
        w, x0 = ink_span(fnt, ch, size)
        place.append({'ch': ch, 'size': size, 'x': cursor - x0, 'w': w, 'mid': cursor + w / 2})
        cursor += w
        if i + 1 < len(chars):
            nch, nsize, nri = chars[i + 1]
            # a junction straddles two sizes; split the difference rather than pick one
            scale = nsize if nri == ri else (size + nsize) / 2
            cursor += natural_gap(fnt, ch, nch) * scale
    total = cursor

    # pass 2 — build each glyph solid, with its own depth and its own die
    objs = []
    for i, p in enumerate(place):
        # ⚑ dome: a smooth forward bow across the word, NOT per-letter noise. Random z would read
        #   as letters that failed to line up; an arc reads as foil laid over a proud plate, and
        #   it is what makes the perspective legible the instant the word turns.
        u = p['mid'] / total if total else 0.5
        dome = DOME * EXTRUDE * (1.0 - (2.0 * u - 1.0) ** 2)
        ext = EXTRUDE * (1.0 + (hash01(i) * 2.0 - 1.0) * EXTRUDE_JITTER)
        cu = _text_curve(fnt, p['ch'], p['size'], extrude=ext, die=DIES[i % len(DIES)])
        ob = bpy.data.objects.new('g%02d' % i, cu)
        ob.location.x = p['x']
        ob.location.z = dome
        bpy.context.collection.objects.link(ob)
        objs.append(ob)
        p['ext'] = ext
        p['dome'] = dome
    bpy.context.view_layer.update()

    verts, face_polys, bevel_polys, rim_polys = [], [], [], []
    nz_hist, dropped = {}, 0
    for ob in objs:
        obe, me = _eval_mesh(ob)
        base = len(verts)
        dx, dz = ob.location.x, ob.location.z
        for v in me.vertices:
            verts.append((v.co.x + dx, v.co.y, v.co.z + dz))
        for poly in me.polygons:
            idx = [base + k for k in poly.vertices]
            nz = poly.normal.z                              # SIGNED — the back half is dropped
            nz_hist[round(nz, 2)] = nz_hist.get(round(nz, 2), 0) + 1
            if nz >= FACE_NZ:
                face_polys.append(idx)
            elif nz >= BEVEL_NZ:
                bevel_polys.append(idx)
            elif nz > -BEVEL_NZ:
                rim_polys.append(idx)                       # the wall — the silhouette, kept
            else:
                dropped += 1                                # rear cap / rear chamfer, never seen
        obe.to_mesh_clear()

    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    zs = [v[2] for v in verts]
    lo = (min(xs), min(ys), min(zs))
    hi = (max(xs), max(ys), max(zs))
    W = hi[0] - lo[0]
    cx, cy, cz = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2

    # ⚑ Normalise WIDTH to 1.0 and centre on the origin. The browser fits from the mesh's own
    #   measured AABB either way, but a canonical scale means every number printed below is
    #   directly comparable between builds — and the extrude depth reads as a fraction of the
    #   wordmark's width, which is how it is judged on screen.
    s = 1.0 / W
    verts = [((x - cx) * s, (y - cy) * s, (z - cz) * s) for (x, y, z) in verts]
    bounds = {'w': 1.0, 'h': (hi[1] - lo[1]) * s, 'd': (hi[2] - lo[2]) * s}
    stats = {
        'chars': len(place),
        'nz': sorted((k, v) for k, v in nz_hist.items() if k > -BEVEL_NZ),
        'dropped': dropped,
        'ext_lo': min(p['ext'] for p in place) * s,
        'ext_hi': max(p['ext'] for p in place) * s,
        'dome': max(p['dome'] for p in place) * s,
    }
    return verts, face_polys, bevel_polys, rim_polys, bounds, stats


def make_object(name, verts, polys, uv_from=None):
    """Build a mesh in EXPORT coordinates from authored ones.

    ⚠ The swap is not cosmetic. glTF is Y-up and Blender is Z-up, and the exporter maps Blender
      (x, y, z) -> glTF (x, z, -y). Type authored flat in Blender's XY plane therefore arrives in
      the browser lying on the FLOOR. Authored (x, y, z) -> Blender (x, -z, y) puts it back
      upright and facing +Z, which is what a camera down -Z expects.

    ⚑ The UV is the SAME planar projection for face and bevel, and that is load-bearing for the
      shader: a planar projection onto the wordmark's own XY plane means the surface tangent
      frame is the constant object-space basis. js/hero3d.js therefore needs no TANGENT attribute
      and no MikkTSpace — it builds the frame from the geometric normal and a baked angle. Change
      this projection and that assumption breaks silently (a normal map lit from the wrong axis
      still looks like a texture).
    """
    me = bpy.data.meshes.new(name)
    used = sorted({i for p in polys for i in p})
    remap = {old: new for new, old in enumerate(used)}
    vs = [(verts[i][0], -verts[i][2], verts[i][1]) for i in used]
    fs = [[remap[i] for i in p] for p in polys]
    me.from_pydata(vs, [], fs)
    me.validate()

    if uv_from is not None:
        lo, hi = uv_from
        uw = (hi[0] - lo[0]) or 1.0
        uh = (hi[1] - lo[1]) or 1.0
        uvl = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = used[me.loops[li].vertex_index]
                uvl.data[li].uv = ((verts[vi][0] - lo[0]) / uw, (verts[vi][1] - lo[1]) / uh)

    for p in me.polygons:
        p.use_smooth = True
    # 4.0 still carries auto-smooth; it is what keeps the curved walls smooth while the die's
    # facet corners stay hard. (Removed in 4.1 — guarded, not assumed.)
    # ⚠ 24°, not v1's 38°: the shelf-to-chamfer corner is a ~20° break and smoothing it away
    #   turns the authored die straight back into a fillet.
    if hasattr(me, 'use_auto_smooth'):
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(24)
    me.update()

    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# ── the foil plate ──────────────────────────────────────────────────────────────────────────

def foil_material(aspect):
    """The foil's SURFACE — everything the live shader needs and nothing it can work out itself.

    Three outputs share one set of fields:
      · Base Color  -> type-albedo   the site's gradient as base ink, shaded by the relief
      · Normal      -> type-normal   pressed cells + stock fibre + a BRUSH that follows `angle`
      · Emission    -> type-foil     r = brush angle / pi + 0.5 · g = grating phase · b = flake

    ⚑ THE BRUSH HAS A DIRECTION AND THE DIRECTION WANDERS. A single global brush axis is what
      makes procedural anisotropy read as a screen-door artifact; a real foil roll wanders by a
      few degrees across its width. `angle` below is one low-frequency noise, and it is used
      TWICE — to rotate the coordinate the streak noise is sampled in (so the baked relief really
      does run that way) and, packed into the foil map, to orient the live anisotropic highlight
      and the grating. One field, so the two can never disagree.
    ⚑ The coordinate is (u * aspect, v) — the plate is ~9:1, so a raw UV lookup would stretch
      every feature nine times horizontally and the foil would read as combed rather than pressed.
    """
    mat = bpy.data.materials.new('foil')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = node(nt, 'ShaderNodeOutputMaterial', (1500, 0))
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', (1200, 0))
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    uv = node(nt, 'ShaderNodeTexCoord', (-2200, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-2020, 0))
    nt.links.new(uv.outputs['UV'], sep.inputs['Vector'])

    # isotropic sampling coordinate
    ax = node(nt, 'ShaderNodeMath', (-1860, 120), operation='MULTIPLY')
    ax.inputs[1].default_value = aspect
    nt.links.new(sep.outputs['X'], ax.inputs[0])
    iso = node(nt, 'ShaderNodeCombineXYZ', (-1700, 60))
    nt.links.new(ax.outputs[0], iso.inputs['X'])
    nt.links.new(sep.outputs['Y'], iso.inputs['Y'])

    # ── the brush angle: one slow noise, in radians, centred on horizontal ──
    angle_n = node(nt, 'ShaderNodeTexNoise', (-1500, 420))
    angle_n.inputs['Scale'].default_value = 1.7
    angle_n.inputs['Detail'].default_value = 2.0
    angle_n.inputs['Roughness'].default_value = 0.45
    nt.links.new(iso.outputs['Vector'], angle_n.inputs['Vector'])
    # noise 0..1 -> radians, +/- 0.09 rad (~5 degrees) about horizontal
    # ⚠ NOT WIDER, and the first cut at +/-17 degrees is why the brush had to be found with a
    #   probe. The plate is 9:1 and only ~116 px tall: a streak tilted 17 degrees climbs 313 px
    #   across the width, so every "streak" crossed the whole height and the field came out as a
    #   marbled swirl rather than a grain. A real foil roll wanders a few degrees, not seventeen.
    ang = node(nt, 'ShaderNodeMapRange', (-1320, 420))
    ang.inputs['From Min'].default_value = 0.30
    ang.inputs['From Max'].default_value = 0.70
    ang.inputs['To Min'].default_value = -0.09
    ang.inputs['To Max'].default_value = 0.09
    ang.clamp = True
    nt.links.new(angle_n.outputs['Fac'], ang.inputs['Value'])

    # rotate the sampling coordinate BY that angle, then squash it: long streaks that curve
    rot = node(nt, 'ShaderNodeVectorRotate', (-1120, 260), rotation_type='Z_AXIS')
    nt.links.new(iso.outputs['Vector'], rot.inputs['Vector'])
    nt.links.new(ang.outputs['Result'], rot.inputs['Angle'])
    squash = node(nt, 'ShaderNodeVectorMath', (-940, 260), operation='MULTIPLY')
    squash.inputs[1].default_value = (0.038, 1.0, 1.0)     # 26x along the brush
    nt.links.new(rot.outputs['Vector'], squash.inputs[0])

    # ⚠ SCALES ARE IN TEXELS, NOT IN TASTE. The plate is 1024 px across `aspect` (~8.93) units,
    #   so one unit is ~115 px and a Scale of N puts a feature every 115/N px. v1's flake-sized
    #   ideas at Scale 190 were 0.6 px — below Nyquist, so they baked as pure noise: aliased on
    #   screen AND uncompressable (the foil map alone was 61 KB of dither). Everything fine here
    #   is kept at 4-5 px.
    brush = node(nt, 'ShaderNodeTexNoise', (-760, 260))
    brush.inputs['Scale'].default_value = 24.0
    # ⚠ Detail 2, not 6. An fBm's octave k has 1/2^k the period, so at Detail 6 the top octaves
    #   here land at 0.08 px across the grain — far below Nyquist, where they bake as isotropic
    #   white noise that both hides the grain and dominates any measurement of it.
    brush.inputs['Detail'].default_value = 2.0
    brush.inputs['Roughness'].default_value = 0.55
    nt.links.new(squash.outputs['Vector'], brush.inputs['Vector'])

    # pressed cells — the stamp's own dimpling, under the brush
    cells = node(nt, 'ShaderNodeTexVoronoi', (-760, 0), feature='F1')
    cells.inputs['Scale'].default_value = 19.0
    cells.inputs['Randomness'].default_value = 0.85
    nt.links.new(iso.outputs['Vector'], cells.inputs['Vector'])

    # stock fibre
    # ⚠ Coarser than build-bg's. That plate is seen at arm's length behind text; this one is the
    #   biggest thing on the page at up to 2x device pixels, where a high-detail fine noise stops
    #   reading as fibre and starts reading as compression speckle.
    fibre = node(nt, 'ShaderNodeTexNoise', (-760, -260))
    fibre.inputs['Scale'].default_value = 33.0
    fibre.inputs['Detail'].default_value = 3.0
    fibre.inputs['Roughness'].default_value = 0.50
    nt.links.new(iso.outputs['Vector'], fibre.inputs['Vector'])

    # ⚑ THE BRUSH HAS TO WIN, AND THE FIRST MIX LOST IT TO NOISE. Measured on the baked map, the
    #   normal came back ISOTROPIC (|d/dy| : |d/dx| = 1.13, i.e. no grain at all) even though the
    #   brush was nominally 62% of the height field. Mean gradient is dominated by the HIGHEST
    #   frequency present, and the stock fibre at Scale 105 was ~1.1 px — below Nyquist, so it
    #   contributed nothing but dither and buried a brush whose cross-grain period is 4.8 px.
    #   The live anisotropic highlight reads its streak direction out of this map; with the map
    #   isotropic there was no streak to read, and the wordmark's specular came back elongated the
    #   WRONG WAY. Weights and scales both moved: the brush is now 0.74 of the mix and everything
    #   under it sits at 3-6 px where it can still be seen.
    mix1 = node(nt, 'ShaderNodeMixRGB', (-520, 120), blend_type='MIX')
    mix1.inputs['Fac'].default_value = 0.25
    nt.links.new(cells.outputs['Distance'], mix1.inputs['Color1'])
    nt.links.new(fibre.outputs['Fac'], mix1.inputs['Color2'])

    relief = node(nt, 'ShaderNodeMixRGB', (-340, 120), blend_type='MIX')
    relief.inputs['Fac'].default_value = 0.74                # the BRUSH dominates — it is metal
    nt.links.new(mix1.outputs['Color'], relief.inputs['Color1'])
    nt.links.new(brush.outputs['Fac'], relief.inputs['Color2'])

    # ── relief -> normal. Baked tangent-space; the browser lights it. ──
    bump = node(nt, 'ShaderNodeBump', (900, -420))
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 0.048
    nt.links.new(relief.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # ── the gradient, transcribed from the CSS. `Fac` is 1 - v so stop 0 lands at the TOP. ──
    flip = node(nt, 'ShaderNodeMath', (-760, -560), operation='SUBTRACT')
    flip.inputs[0].default_value = 1.0
    nt.links.new(sep.outputs['Y'], flip.inputs[1])

    grad = node(nt, 'ShaderNodeValToRGB', (-520, -560))
    cr = grad.color_ramp
    cr.elements[0].position = RAMP[0][0]
    cr.elements[0].color = (*srgb_to_linear(hexrgb(RAMP[0][1])), 1)
    cr.elements[1].position = RAMP[1][0]
    cr.elements[1].color = (*srgb_to_linear(hexrgb(RAMP[1][1])), 1)
    for pos, hx in RAMP[2:]:
        e = cr.elements.new(pos)
        e.color = (*srgb_to_linear(hexrgb(hx)), 1)
    nt.links.new(flip.outputs[0], grad.inputs['Fac'])

    # ── the relief modulates the ink: brush tops take the light, recesses go a little darker.
    #    ⚠ Kept well clear of black. This is the brightest thing above the fold; crushing the
    #    recesses puts holes in the letterforms at small sizes. ──
    shade = node(nt, 'ShaderNodeValToRGB', (-120, 120))
    shade.color_ramp.elements[0].position = 0.12
    shade.color_ramp.elements[0].color = (0.74, 0.74, 0.74, 1)
    shade.color_ramp.elements[1].position = 0.86
    shade.color_ramp.elements[1].color = (1.22, 1.22, 1.22, 1)
    nt.links.new(relief.outputs['Color'], shade.inputs['Fac'])

    paint = node(nt, 'ShaderNodeMixRGB', (200, 40), blend_type='MULTIPLY')
    paint.inputs['Fac'].default_value = 1.0
    nt.links.new(grad.outputs['Color'], paint.inputs['Color1'])
    nt.links.new(shade.outputs['Color'], paint.inputs['Color2'])
    nt.links.new(paint.outputs['Color'], bsdf.inputs['Base Color'])

    # ⚑ HERO_PROBE=<field> BAKES ONE HEIGHT FIELD STRAIGHT INTO THE ALBEDO SLOT, the same trick
    #   build-site-props.py's SITE_PROBE exists for, and for the same reason: these fields are
    #   combined and then differentiated before anything visible comes out, so a mistake three
    #   nodes upstream shows up as a texture that merely looks a bit different. It is how the
    #   missing brush was found — `HERO_PROBE=brush` renders the streak field on its own, where
    #   "there are no streaks in it" is a one-line measurement instead of a guess.
    #     HERO_PROBE=brush blender --background --factory-startup -P scripts/blender/build-hero-type.py
    probe = os.environ.get('HERO_PROBE', '')
    if probe:
        src = {'brush': brush.outputs['Fac'], 'cells': cells.outputs['Distance'],
               'fibre': fibre.outputs['Fac'], 'relief': relief.outputs['Color'],
               'squash': squash.outputs['Vector'], 'rot': rot.outputs['Vector'],
               'iso': iso.outputs['Vector'], 'angle': ang.outputs['Result']}.get(probe)
        if src is not None:
            nt.links.new(src, bsdf.inputs['Base Color'])

    # ── the DATA plate: brush angle · grating phase · flake ───────────────────────────────────
    # r: angle/pi + 0.5, so 0.5 is horizontal and 8-bit steps are 0.7 degrees
    enc = node(nt, 'ShaderNodeMapRange', (-1120, 560))
    enc.inputs['From Min'].default_value = -math.pi / 2
    enc.inputs['From Max'].default_value = math.pi / 2
    enc.inputs['To Min'].default_value = 0.0
    enc.inputs['To Max'].default_value = 1.0
    enc.clamp = True
    nt.links.new(ang.outputs['Result'], enc.inputs['Value'])

    # g: grating phase — where in the foil's rainbow this patch sits before the view moves it.
    #    Two scales: broad bands across the word plus cell-sized patches, which is what makes a
    #    refractor break into blotches instead of one clean sweep.
    ph_broad = node(nt, 'ShaderNodeTexNoise', (-1500, -900))
    ph_broad.inputs['Scale'].default_value = 2.4
    ph_broad.inputs['Detail'].default_value = 2.0
    nt.links.new(iso.outputs['Vector'], ph_broad.inputs['Vector'])
    ph_cell = node(nt, 'ShaderNodeTexVoronoi', (-1500, -1140), feature='F1')
    ph_cell.inputs['Scale'].default_value = 13.0
    ph_cell.inputs['Randomness'].default_value = 1.0
    nt.links.new(iso.outputs['Vector'], ph_cell.inputs['Vector'])
    phase = node(nt, 'ShaderNodeMixRGB', (-1240, -980), blend_type='MIX')
    phase.inputs['Fac'].default_value = 0.42
    nt.links.new(ph_broad.outputs['Fac'], phase.inputs['Color1'])
    nt.links.new(ph_cell.outputs['Color'], phase.inputs['Color2'])
    ph_s = node(nt, 'ShaderNodeSeparateXYZ', (-1060, -980))
    nt.links.new(phase.outputs['Color'], ph_s.inputs['Vector'])

    # b: flake — sharp, high-frequency specular breakup. A foil that glints as ONE sheet is a
    #    mirror; a foil that glints in grains is foil.
    flake_v = node(nt, 'ShaderNodeTexVoronoi', (-1500, -1400), feature='F1')
    flake_v.inputs['Scale'].default_value = 26.0
    flake_v.inputs['Randomness'].default_value = 1.0
    nt.links.new(iso.outputs['Vector'], flake_v.inputs['Vector'])
    flake = node(nt, 'ShaderNodeMapRange', (-1240, -1400))
    flake.inputs['From Min'].default_value = 0.0
    flake.inputs['From Max'].default_value = 0.42
    flake.inputs['To Min'].default_value = 1.0
    flake.inputs['To Max'].default_value = 0.0
    flake.clamp = True
    nt.links.new(flake_v.outputs['Distance'], flake.inputs['Value'])

    data = node(nt, 'ShaderNodeCombineXYZ', (-860, -1100))
    nt.links.new(enc.outputs['Result'], data.inputs['X'])
    nt.links.new(ph_s.outputs['X'], data.inputs['Y'])
    nt.links.new(flake.outputs['Result'], data.inputs['Z'])

    emit = node(nt, 'ShaderNodeEmission', (1200, -700))
    emit.inputs['Strength'].default_value = 1.0
    nt.links.new(data.outputs['Vector'], emit.inputs['Color'])

    return mat, nt, {'out': out, 'bsdf': bsdf, 'emit': emit}


def save_both(img, stem, quality=None):
    """Ship the WebP, write a lossless PNG beside it for the measurement pass to read.

    Same split as build-bg.py: quality is judged on the uncompressed pixels so a failing check
    cannot be blamed on WebP ringing, while the size budget is judged on the file that ships.
    scripts/build-hero-type.mjs deletes the PNGs when it is done with them.
    """
    img.filepath_raw = stem + '.png'
    img.file_format = 'PNG'
    img.save()
    img.filepath_raw = stem + '.' + EXT
    img.file_format = FMT
    img.save(quality=QUALITY if quality is None else quality)
    return stem + '.' + EXT


def bake_plate(aspect, outdir, w, h):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    # 1 sample: DIFFUSE-COLOR, NORMAL and EMIT are shader evaluations, not light transport. (This
    # build also has no OpenImageDenoise, so `use_denoising = True` would simply error.)
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.margin = 0

    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.object
    # ⚠ The PLANE carries the aspect, not just the texture coordinate. The Bump node
    #   differentiates height against SURFACE position, so on a square plane a coordinate scaled
    #   9x in u would come back with its x-gradient 9x too strong — a normal map that is combed
    #   horizontally whatever the brush angle says.
    plane.scale.x = aspect
    bpy.ops.object.transform_apply(scale=True)

    mat, nt, ports = foil_material(aspect)
    plane.data.materials.append(mat)

    def target(name, is_data):
        img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False, is_data=is_data)
        tex = node(nt, 'ShaderNodeTexImage', (-2600, -1600))
        tex.image = img
        nt.nodes.active = tex
        for n in nt.nodes:
            n.select = False
        tex.select = True
        return img, tex

    outs = {}
    img, tex = target('hero_albedo', False)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    outs['albedo'] = save_both(img, os.path.join(outdir, 'type-albedo'))
    nt.nodes.remove(tex)

    img, tex = target('hero_normal', True)
    bpy.ops.object.bake(type='NORMAL')
    outs['normal'] = save_both(img, os.path.join(outdir, 'type-normal'))
    nt.nodes.remove(tex)

    # ⚠ EMIT LAST, and only after the other two. Wiring Emission into Surface replaces the BSDF,
    #   so a NORMAL bake taken afterwards would have no normal input to read and would come back
    #   flat — a perfectly valid image and a completely dead surface.
    nt.links.new(ports['emit'].outputs['Emission'], ports['out'].inputs['Surface'])
    img, tex = target('hero_foil', True)
    bpy.ops.object.bake(type='EMIT')
    outs['foil'] = save_both(img, os.path.join(outdir, 'type-foil'), quality=FOIL_QUALITY)
    nt.nodes.remove(tex)
    return outs


def rgb_to_hsv(c):
    r, g, b = c
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d < 1e-9:
        h = 0.0
    elif mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return (h * 60.0, 0.0 if mx <= 0 else d / mx, mx)


def hsv_to_rgb(hsv):
    h, s, v = hsv
    h = (h % 360.0) / 60.0
    i = int(math.floor(h))
    f = h - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    return [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]


def write_spectrum(outdir):
    """The diffraction LUT: the site's six CSS stops, made into a LOOP.

    ⚑ This is the file that decides what colour the foil can ever be, and the answer is "a site
      colour". The shader's grating phase is fract()'d into this strip, so however far the hue
      walks it walks around the wordmark's own palette. A generic rainbow was never an option —
      it would stop being this studio's wordmark the moment somebody moved their head.

    ⚑ INTERPOLATED BY HUE, NOT BY RGB, and that is worth a paragraph because it is the difference
      between a spectrum and a gradient. Mixing #7aa8ff to #ff2ad9 componentwise passes through a
      washed lilac; mixing #ff2ad9 to #ffd23b passes through a dirty peach. Measured on the live
      render, a componentwise LUT capped the wordmark's per-pixel saturation at a median of 0.53
      no matter what the lighting did — the pale, pastel look of the first cut was baked into the
      palette itself, three layers below where it was visible. Interpolating H (shortest arc), S
      and V separately keeps every intermediate as saturated as the stops it sits between, which
      is what a diffraction grating actually produces: a HUE SWEEP. The six stops themselves are
      untouched and still land exactly where the CSS says, so the identity is unchanged; only the
      colours BETWEEN them differ, and those never existed as a design decision anyway.
      ⚠ Done in sRGB HSV, not linear: hue is a perceptual construct and the stops were chosen by
        eye in sRGB. The bytes written are therefore already the encoded values.

    ⚠ PNG, not WebP, and no mipmaps in the browser. Lossy compression on a 256-entry palette
      shifts colours that are then multiplied over the whole word, and a mipmapped LUT averages
      the entire palette to grey at the first level down.
    ⚠ Written as DATA (is_data=True) so Blender applies NO transform of its own — the bytes in
      the file are exactly the bytes computed here, and build-hero-type.mjs re-derives them
      independently and compares.
    """
    h = 8
    img = bpy.data.images.new('hero_spectrum', LUT_W, h, alpha=False,
                              float_buffer=False, is_data=True)
    stops = [(p, rgb_to_hsv(hexrgb(c))) for p, c in RAMP]
    # close the loop: the last stop wraps back to the first, one turn on in position AND in hue,
    # so the sweep goes the long way round the colour wheel instead of doubling back through it
    turns = 0.0
    unwrapped = []
    prev = None
    for p, (hh, ss, vv) in stops:
        if prev is not None:
            while hh + turns < prev - 180.0:
                turns += 360.0
        unwrapped.append((p, (hh + turns, ss, vv)))
        prev = hh + turns
    first = unwrapped[0]
    endh = first[1][0] + turns
    while endh < prev - 180.0:
        endh += 360.0
    loop = unwrapped + [(first[0] + 1.0, (endh, first[1][1], first[1][2]))]

    row = []
    for i in range(LUT_W):
        t = i / LUT_W
        tt = t if t >= stops[0][0] else t + 1.0
        col = loop[-1][1]
        for k in range(len(loop) - 1):
            a, b = loop[k], loop[k + 1]
            if a[0] <= tt <= b[0]:
                f = (tt - a[0]) / (b[0] - a[0]) if b[0] > a[0] else 0.0
                col = tuple(a[1][j] + (b[1][j] - a[1][j]) * f for j in range(3))
                break
        row.append(hsv_to_rgb(col))
    px = []
    for _ in range(h):
        for c in row:
            px.extend([c[0], c[1], c[2], 1.0])
    img.pixels = px
    stem = os.path.join(outdir, 'type-spectrum')
    img.filepath_raw = stem + '.png'
    img.file_format = 'PNG'
    img.save()
    return stem + '.png'


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else 'media/hero'
    font = argv[1] if len(argv) > 1 else 'build/hero-type/anton.ttf'
    os.makedirs(outdir, exist_ok=True)

    verts, face_polys, bevel_polys, rim_polys, b, st = build_type(font)
    lo = (min(v[0] for v in verts), min(v[1] for v in verts))
    hi = (max(v[0] for v in verts), max(v[1] for v in verts))

    # a fresh scene for the export, so nothing from the text build rides along
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    face = make_object('wm_face', verts, face_polys, uv_from=(lo, hi))
    bevel = make_object('wm_bevel', verts, bevel_polys, uv_from=(lo, hi))
    rim = make_object('wm_rim', verts, rim_polys)          # no UVs: see the header

    glb = os.path.join(outdir, 'type.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=False,
        export_apply=True, export_normals=True, export_texcoords=True,
        export_materials='NONE', export_yup=True)

    # ⚠ Counted BEFORE the bake: bake_plate() resets to an empty file, so anything read from
    #   these objects afterwards is read from meshes that no longer exist.
    parts = [(ob.name, len(ob.data.vertices),
              sum(len(p.vertices) - 2 for p in ob.data.polygons)) for ob in (face, bevel, rim)]

    aspect = b['w'] / b['h']
    tw = TEX_W
    th = max(8, int(round(tw / aspect / 4)) * 4)           # keep it a multiple of 4
    outs = bake_plate(aspect, outdir, tw, th)
    outs['spectrum'] = write_spectrum(outdir)

    for name, nv, ntri in parts:
        print('  PART %s verts=%d tris=%d' % (name, nv, ntri))
    print('  FACETS ' + ' '.join('%.2f:%d' % kv for kv in st['nz'])
          + '  (dropped %d rear polys)' % st['dropped'])
    print('  DEPTH chars=%d extrude %.5f..%.5f dome %.5f'
          % (st['chars'], st['ext_lo'], st['ext_hi'], st['dome']))
    print('HERO_OK glb=%s aspect=%.4f h=%.5f d=%.5f tex=%dx%d lut=%d %s'
          % (glb, aspect, b['h'], b['d'], tw, th, LUT_W,
             ' '.join('%s=%s' % kv for kv in outs.items())))


main()

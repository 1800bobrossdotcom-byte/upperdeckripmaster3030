# ripmaster3030studios — the landing page's hero wordmark, as real 3D type.
#
#   blender --background --factory-startup -noaudio -P scripts/blender/build-hero-type.py \
#           -- media/hero build/hero-type/anton.ttf
#   (or just: npm run herotype, which also decompresses the font and measures the result)
#
# WHAT IT IS. RIPMASTER3030STUDIOS, cut from the repo's own vendored Anton outlines, extruded and
# bevelled into a mesh, plus a baked foil plate for its face. js/hero3d.js lights it live in the
# browser. Three files come out:
#
#     media/hero/type.glb            two objects — `wm_face` and `wm_rim`
#     media/hero/type-albedo.webp    the foil paint for the face, in the type's own UV layout
#     media/hero/type-normal.webp    fine pressed-foil relief for the face
#
# ⚑ TWO OBJECTS, SPLIT BY FACE NORMAL, AND THAT SPLIT IS THE WHOLE REASON THIS WORKS.
#   The UV is a PLANAR projection of the wordmark's own bounding box — which is the only
#   projection that lets one continuous colour ramp run down through every letter the way the CSS
#   `background-clip:text` gradient does today. But a planar projection is DEGENERATE on the
#   extrusion walls: their UV area collapses to a line, so their tangent frame is undefined and a
#   normal map sampled there is garbage. Rather than paper over that in the shader, the walls are
#   a separate object with no UVs at all and get a plain metal material in the browser. Which is
#   also what the thing IS: a foil stamp has a printed face and a bare metal edge.
#   The threshold is |n.z| >= 0.30, so all three bevel facets (0.92 / 0.71 / 0.38) stay with the
#   FACE — the bevel is what catches the key light and sells the emboss, so it must be foil.
#
# ⚑ BAKED, NOT RENDERED — the same measured constraint that shaped scripts/blender/build-bg.py.
#   EEVEE cannot run in this container (no libEGL) and Cycles on CPU took 133 s for one 640×360
#   frame, so a rendered wordmark is hours. A Cycles BAKE of the DIFFUSE-COLOR and NORMAL passes
#   at 1 sample is a shader evaluation rather than light transport and costs about a second. The
#   lighting is then real and per-frame in the browser, which is the only way a wordmark can react
#   to a pointer anyway.
#
# ⚑ NO 4-D TORUS HERE, deliberately. build-bg.py samples its noise on a torus embedded in 4-D
#   because that plate TILES across a whole page. This plate does not tile — it is a single
#   unique image the exact shape of the wordmark, so its edges never meet anything. The torus
#   trick costs shader nodes and buys nothing when there is no wrap.
#
# ⚠ BRIGHTNESS RUNS THE OPPOSITE WAY FROM THE BACKGROUND. build-bg.mjs fails a plate that is too
#   BRIGHT, because paragraphs sit on it. This one fails if it is too DARK: nothing sits on the
#   wordmark, it is the brightest thing above the fold, and a dim foil reads as a rendering bug.
#
# The colour ramp is the site's existing CSS wordmark gradient, transcribed stop for stop —
# `linear-gradient(178deg,#eafff2 4%,#2bff80 24%,#27f7e4 46%,#7aa8ff 60%,#ff2ad9 80%,#ffd23b 96%)`.
# The point of this build is to make the wordmark an OBJECT, not to redesign it, so the palette,
# the word and the small-`3030` proportion all come across unchanged.
#
# Everything else is procedural: no external image is sampled, and the only third-party input is
# the repo's own OFL-licensed Anton, used to generate outlines (which OFL expressly permits).

import sys
import os
import math

import bpy                                                                       # noqa: E402

FMT = os.environ.get('HERO_FMT', 'WEBP')
EXT = 'webp' if FMT == 'WEBP' else 'png'
QUALITY = int(os.environ.get('HERO_QUALITY', '82'))
TEX_W = int(os.environ.get('HERO_TEX_W', '1024'))

# ⚑ The word is set in three runs because the CSS is: `.sm` puts `3030` at 0.62em on the same
#   baseline. Three text objects with one shared baseline is the same typographic statement, and
#   the junction gaps between them are MEASURED from the font (see natural_gap) rather than
#   guessed — a hand-tuned gap is a number nobody can check after the fact.
RUNS = [('RIPMASTER', 1.00), ('3030', 0.62), ('STUDIOS', 1.00)]

EXTRUDE = 0.055          # half-depth, in units where the cap height is ~0.516
BEVEL = 0.013
BEVEL_RES = 2
CURVE_RES = 2            # outline subdivision; 2 holds Anton's curves and halves the vertex count
FACE_NZ = 0.30           # |normal.z| at or above this is FACE (incl. every bevel facet)

# the CSS wordmark gradient, top -> bottom, as (position, sRGB hex)
RAMP = [(0.04, '#eafff2'), (0.24, '#2bff80'), (0.46, '#27f7e4'),
        (0.60, '#7aa8ff'), (0.80, '#ff2ad9'), (0.96, '#ffd23b')]


def srgb_to_linear(c):
    """Blender works linear; CSS hex is sRGB. Skipping this is a stop of wash on the accents."""
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


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


# ── the type ────────────────────────────────────────────────────────────────────────────────

def _text_curve(fnt, body, size, res=CURVE_RES, solid=True):
    cu = bpy.data.curves.new(body + '_c', 'FONT')
    cu.body = body
    cu.font = fnt
    cu.size = size
    cu.align_x = 'LEFT'
    cu.align_y = 'BOTTOM_BASELINE'
    cu.resolution_u = res
    if solid:
        cu.extrude = EXTRUDE
        cu.bevel_depth = BEVEL
        cu.bevel_resolution = BEVEL_RES
    return cu


def _eval_mesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    obe = ob.evaluated_get(dg)
    return obe, obe.to_mesh()


def ink_span(fnt, body, size):
    """Ink extent of a run: (width, left edge). Blender gives no advance width, only geometry,
    which is exactly what we want — the layout below is optical, not metric."""
    cu = _text_curve(fnt, body, size, res=1, solid=False)
    ob = bpy.data.objects.new('probe', cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.update()
    obe, me = _eval_mesh(ob)
    xs = [v.co.x for v in me.vertices]
    span = (max(xs) - min(xs), min(xs))
    obe.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    return span


def natural_gap(fnt, a, b):
    """The font's OWN gap at the a|b junction: set `ab` as one run and subtract the two ink
    widths. Setting the runs separately loses their side bearings, and a made-up constant would
    put the `3030` visibly adrift from the letters at exactly one size."""
    return ink_span(fnt, a + b, 1.0)[0] - ink_span(fnt, a, 1.0)[0] - ink_span(fnt, b, 1.0)[0]


def build_type(font_path):
    """Returns (verts, faces_by_group, bounds) in AUTHORED coordinates: +x right, +y up, +z out."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fnt = bpy.data.fonts.load(font_path)

    gaps = [natural_gap(fnt, RUNS[0][0], RUNS[1][0]), natural_gap(fnt, RUNS[1][0], RUNS[2][0])]
    # the junctions straddle two sizes; split the difference rather than pick one
    scale_at_junction = [(RUNS[0][1] + RUNS[1][1]) / 2, (RUNS[1][1] + RUNS[2][1]) / 2]

    objs = []
    cursor = 0.0
    for i, (body, size) in enumerate(RUNS):
        w, x0 = ink_span(fnt, body, size)
        cu = _text_curve(fnt, body, size)
        ob = bpy.data.objects.new('run%d' % i, cu)
        ob.location.x = cursor - x0
        bpy.context.collection.objects.link(ob)
        objs.append(ob)
        cursor += w
        if i < len(gaps):
            cursor += gaps[i] * scale_at_junction[i]
    bpy.context.view_layer.update()

    verts, face_polys, rim_polys = [], [], []
    for ob in objs:
        obe, me = _eval_mesh(ob)
        base = len(verts)
        dx = ob.location.x
        for v in me.vertices:
            verts.append((v.co.x + dx, v.co.y, v.co.z))
        for p in me.polygons:
            idx = [base + i for i in p.vertices]
            (face_polys if abs(p.normal.z) >= FACE_NZ else rim_polys).append(idx)
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
    bounds = {
        'w': 1.0,
        'h': (hi[1] - lo[1]) * s,
        'd': (hi[2] - lo[2]) * s,
        'cap': None,
    }
    return verts, face_polys, rim_polys, bounds


def make_object(name, verts, polys, uv_from=None):
    """Build a mesh in EXPORT coordinates from authored ones.

    ⚠ The swap is not cosmetic. glTF is Y-up and Blender is Z-up, and the exporter maps Blender
      (x, y, z) -> glTF (x, z, -y). Type authored flat in Blender's XY plane therefore arrives in
      the browser lying on the FLOOR. Authored (x, y, z) -> Blender (x, -z, y) puts it back
      upright and facing +Z, which is what a camera down -Z expects.
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
    # 4.0 still carries auto-smooth; it is what keeps the curved walls smooth while the
    # face/bevel corner stays a hard edge. (Removed in 4.1 — guarded, not assumed.)
    if hasattr(me, 'use_auto_smooth'):
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(38)
    me.update()

    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# ── the foil plate ──────────────────────────────────────────────────────────────────────────

def foil_material(aspect):
    """Pressed foil over the site's own wordmark gradient.

    ⚑ The relief is two scales an order of magnitude apart, the same argument build-bg.py makes:
      a large voronoi that reads as the pressed cells of a foil stamp and a fine noise that reads
      as the stock under it. One scale alone always looks like a procedural texture.
    ⚑ The coordinate is (u * aspect, v) — the plate is ~9:1, so a raw UV lookup would stretch
      every cell nine times horizontally and the foil would read as combed rather than pressed.
    """
    mat = bpy.data.materials.new('foil')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = node(nt, 'ShaderNodeOutputMaterial', (900, 0))
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', (640, 0))

    uv = node(nt, 'ShaderNodeTexCoord', (-1500, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-1320, 0))
    nt.links.new(uv.outputs['UV'], sep.inputs['Vector'])

    # isotropic sampling coordinate
    ax = node(nt, 'ShaderNodeMath', (-1150, 120), operation='MULTIPLY')
    ax.inputs[1].default_value = aspect
    nt.links.new(sep.outputs['X'], ax.inputs[0])
    iso = node(nt, 'ShaderNodeCombineXYZ', (-980, 60))
    nt.links.new(ax.outputs[0], iso.inputs['X'])
    nt.links.new(sep.outputs['Y'], iso.inputs['Y'])

    # pressed cells
    cells = node(nt, 'ShaderNodeTexVoronoi', (-780, 260), feature='F1')
    cells.inputs['Scale'].default_value = 26.0
    nt.links.new(iso.outputs['Vector'], cells.inputs['Vector'])

    # stock fibre
    # ⚠ Weaker and coarser than build-bg's. That plate is seen at arm's length behind text; this
    #   one is the biggest thing on the page and is sampled at up to 2x device pixels, where a
    #   high-detail fine noise stops reading as fibre and starts reading as compression speckle.
    fibre = node(nt, 'ShaderNodeTexNoise', (-780, -20))
    fibre.inputs['Scale'].default_value = 105.0
    fibre.inputs['Detail'].default_value = 4.0
    fibre.inputs['Roughness'].default_value = 0.50
    nt.links.new(iso.outputs['Vector'], fibre.inputs['Vector'])

    # brushed streaks — a foil stamp is drawn off a roll, and the roll leaves a direction
    brush_c = node(nt, 'ShaderNodeCombineXYZ', (-980, -300))
    bx = node(nt, 'ShaderNodeMath', (-1150, -260), operation='MULTIPLY')
    bx.inputs[1].default_value = aspect * 0.30
    nt.links.new(sep.outputs['X'], bx.inputs[0])
    by = node(nt, 'ShaderNodeMath', (-1150, -380), operation='MULTIPLY')
    by.inputs[1].default_value = 26.0
    nt.links.new(sep.outputs['Y'], by.inputs[0])
    nt.links.new(bx.outputs[0], brush_c.inputs['X'])
    nt.links.new(by.outputs[0], brush_c.inputs['Y'])
    brush = node(nt, 'ShaderNodeTexNoise', (-780, -300))
    brush.inputs['Scale'].default_value = 9.0
    brush.inputs['Detail'].default_value = 3.0
    nt.links.new(brush_c.outputs['Vector'], brush.inputs['Vector'])

    mix1 = node(nt, 'ShaderNodeMixRGB', (-520, 160), blend_type='MIX')
    mix1.inputs['Fac'].default_value = 0.15
    nt.links.new(cells.outputs['Distance'], mix1.inputs['Color1'])
    nt.links.new(fibre.outputs['Fac'], mix1.inputs['Color2'])

    relief = node(nt, 'ShaderNodeMixRGB', (-340, 160), blend_type='MIX')
    relief.inputs['Fac'].default_value = 0.20
    nt.links.new(mix1.outputs['Color'], relief.inputs['Color1'])
    nt.links.new(brush.outputs['Fac'], relief.inputs['Color2'])

    # ── relief -> normal. Baked tangent-space; the browser lights it. ──
    bump = node(nt, 'ShaderNodeBump', (400, -320))
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 0.035
    nt.links.new(relief.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # ── the gradient, transcribed from the CSS. `Fac` is 1 - v so stop 0 lands at the TOP. ──
    flip = node(nt, 'ShaderNodeMath', (-780, -560), operation='SUBTRACT')
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

    # ── the relief modulates the paint: cell tops take the foil, recesses go a little darker.
    #    ⚠ Kept well clear of black. This is the brightest thing above the fold; crushing the
    #    recesses puts holes in the letterforms at small sizes. ──
    shade = node(nt, 'ShaderNodeValToRGB', (-120, 160))
    shade.color_ramp.elements[0].position = 0.10
    shade.color_ramp.elements[0].color = (0.76, 0.76, 0.76, 1)
    shade.color_ramp.elements[1].position = 0.85
    shade.color_ramp.elements[1].color = (1.20, 1.20, 1.20, 1)
    nt.links.new(relief.outputs['Color'], shade.inputs['Fac'])

    paint = node(nt, 'ShaderNodeMixRGB', (200, 40), blend_type='MULTIPLY')
    paint.inputs['Fac'].default_value = 1.0
    nt.links.new(grad.outputs['Color'], paint.inputs['Color1'])
    nt.links.new(shade.outputs['Color'], paint.inputs['Color2'])
    nt.links.new(paint.outputs['Color'], bsdf.inputs['Base Color'])

    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat, nt


def save_both(img, stem):
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
    img.save(quality=QUALITY)
    return stem + '.' + EXT


def bake_plate(aspect, outdir, w, h):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    # 1 sample: DIFFUSE-COLOR and NORMAL are shader evaluations, not light transport. (This build
    # also has no OpenImageDenoise, so `use_denoising = True` would simply error.)
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
    #   horizontally. Stretching the plane keeps du and dv the same size in world units.
    plane.scale.x = aspect
    bpy.ops.object.transform_apply(scale=True)

    mat, nt = foil_material(aspect)
    plane.data.materials.append(mat)

    def target(name, is_data):
        img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False, is_data=is_data)
        tex = node(nt, 'ShaderNodeTexImage', (-1900, -800))
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
    return outs


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else 'media/hero'
    font = argv[1] if len(argv) > 1 else 'build/hero-type/anton.ttf'
    os.makedirs(outdir, exist_ok=True)

    verts, face_polys, rim_polys, b = build_type(font)
    lo = (min(v[0] for v in verts), min(v[1] for v in verts))
    hi = (max(v[0] for v in verts), max(v[1] for v in verts))

    # a fresh scene for the export, so nothing from the text build rides along
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    face = make_object('wm_face', verts, face_polys, uv_from=(lo, hi))
    rim = make_object('wm_rim', verts, rim_polys)          # no UVs: see the header

    glb = os.path.join(outdir, 'type.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=False,
        export_apply=True, export_normals=True, export_texcoords=True,
        export_materials='NONE', export_yup=True)

    # ⚠ Counted BEFORE the bake: bake_plate() resets to an empty file, so anything read from
    #   these objects afterwards is read from meshes that no longer exist.
    parts = [(ob.name, len(ob.data.vertices),
              sum(len(p.vertices) - 2 for p in ob.data.polygons)) for ob in (face, rim)]

    aspect = b['w'] / b['h']
    tw = TEX_W
    th = max(8, int(round(tw / aspect / 4)) * 4)           # keep it a multiple of 4
    outs = bake_plate(aspect, outdir, tw, th)

    for name, nv, nt in parts:
        print('  PART %s verts=%d tris=%d' % (name, nv, nt))
    print('HERO_OK glb=%s aspect=%.4f h=%.5f d=%.5f tex=%dx%d %s'
          % (glb, aspect, b['h'], b['d'], tw, th,
             ' '.join('%s=%s' % kv for kv in outs.items())))


main()

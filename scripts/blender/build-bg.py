# ripmaster3030studios — the site's background material, authored and baked in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-bg.py -- media/bg
#   (or just: npm run bg)
#
# WHAT IT IS: embossed foil card stock, baked to a seamlessly tiling albedo + normal map.
# The trading card is this studio's whole form — "a size before it's anything" — so the site's
# backdrop is the MATERIAL a card is made of, seen too close to read as a card: foil stamping,
# pressed cell relief, paper fibre.
#
# ⚑ WHY A BAKED MATERIAL AND NOT A RENDERED VIDEO. The first version of this file rendered an
#   animation: a cylinder of stock turning 360°, which loops exactly because the geometry
#   returns to its start. It was measured and abandoned. EEVEE cannot run here at all (no
#   libEGL), and Cycles on 4 CPU cores took **133 s for ONE 640×360 frame** — a 160-frame 720p
#   loop is ~35 hours. Dropping the resolution far enough to afford it produces a soft, blurry
#   plate, which is a poor trade for something whose entire job is to look TEXTURED.
#   Baking wins on every axis that matters here: 1024² of crisp relief instead of 480p mush,
#   a few hundred KB instead of megabytes on every page load, and the animation becomes real
#   per-frame lighting (js/bg-foil.js) rather than a loop — so it never seams and never repeats.
#   The relief, the foil and the colour are still entirely Blender's.
#
# ⚑ SEAMLESS IS DONE PROPERLY, VIA A 4-D TORUS — NOT BY MIRRORING OR BLURRING THE EDGES.
#   Blender's noise is not periodic, so a plain UV lookup cannot tile: the left edge has no
#   reason to match the right. The fix is to sample the noise on the surface of a torus embedded
#   in 4-D — map u,v to (cos 2πu, sin 2πu, cos 2πv, sin 2πv) and read 4-D noise there. Walking
#   u from 0 to 1 walks a full circle and arrives exactly where it started, in every octave, so
#   the tile is periodic BY CONSTRUCTION rather than patched up afterwards. Mirroring would have
#   put a visible axis of symmetry across the page; edge-blending would have put a soft cross
#   through the one part of the image that has to look like material.
#
# ⚠ IT HAS TO SIT UNDER TEXT. Legibility beats spectacle: the albedo is near-black and the
#   palette lives in the foil tint and the specular, not the paint. scripts/build-bg.mjs
#   measures the bake and fails if it is too bright or too contrasty to put paragraphs on.
#
# Everything is procedural — no external image is sampled, so there is nothing to licence.

import sys
import os
import math

import bpy                                                                       # noqa: E402

# ⚠ WebP, not PNG: a normal map is high-frequency by nature and PNG cannot compress it — the
#   1024² normal came out at 2.8 MB, on a plate that loads on EVERY page. WebP at q90 is ~20x
#   smaller with no visible difference once it is being used to perturb a light.
FMT = os.environ.get('BG_FMT', 'WEBP')
EXT = 'webp' if FMT == 'WEBP' else 'png'
QUALITY = int(os.environ.get('BG_QUALITY', '82'))

PHOS = (0.043, 1.000, 0.290)     # --phos   #2bff80
ACID = (1.000, 0.086, 0.850)     # --acid   #ff2ad9
CYAN = (0.086, 0.969, 0.894)     # --cyan   #27f7e4
GOLD = (1.000, 0.824, 0.231)     # --gold   #ffd23b


def srgb_to_linear(c):
    """Blender works linear; those CSS values are sRGB. Skipping this washes the accents out by
    about a stop and they stop reading as the site's greens."""
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def node(nt, kind, loc=(0, 0), **kw):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in kw.items():
        if hasattr(n, k):
            setattr(n, k, v)
    return n


def torus_coords(nt, x=-1700):
    """UV -> a point on a 4-D torus, so every texture read from it tiles perfectly in u and v.

    Returns (vector_socket, w_socket): Blender's 4-D textures take a 3-component Vector plus a
    separate W, which is exactly the four numbers we need — (cos u, sin u, cos v) and sin v.
    """
    uv = node(nt, 'ShaderNodeTexCoord', (x, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (x + 200, 0))
    nt.links.new(uv.outputs['UV'], sep.inputs['Vector'])

    def circle(sock, y):
        # angle = 2*pi*component
        ang = node(nt, 'ShaderNodeMath', (x + 380, y), operation='MULTIPLY')
        ang.inputs[1].default_value = math.tau
        nt.links.new(sock, ang.inputs[0])
        c = node(nt, 'ShaderNodeMath', (x + 550, y + 60), operation='COSINE')
        s = node(nt, 'ShaderNodeMath', (x + 550, y - 60), operation='SINE')
        nt.links.new(ang.outputs[0], c.inputs[0])
        nt.links.new(ang.outputs[0], s.inputs[0])
        return c.outputs[0], s.outputs[0]

    cu, su = circle(sep.outputs['X'], 260)
    cv, sv = circle(sep.outputs['Y'], -260)

    comb = node(nt, 'ShaderNodeCombineXYZ', (x + 760, 60))
    nt.links.new(cu, comb.inputs['X'])
    nt.links.new(su, comb.inputs['Y'])
    nt.links.new(cv, comb.inputs['Z'])
    return comb.outputs['Vector'], sv


def scaled(nt, vec, k, loc):
    """Scale the torus vector — this is how 'texture scale' works once the coordinate is fixed."""
    m = node(nt, 'ShaderNodeVectorMath', loc, operation='SCALE')
    m.inputs['Scale'].default_value = k
    nt.links.new(vec, m.inputs[0])
    return m.outputs['Vector']


def stock_material():
    """Embossed foil card stock.

    ⚑ The relief is TWO scales an order of magnitude apart on purpose: a large voronoi that reads
      as the pressed cell pattern of a foil stamp, and a fine noise that reads as paper fibre.
      One scale alone always looks like a procedural texture; two look like a material.
    """
    mat = bpy.data.materials.new('stock')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = node(nt, 'ShaderNodeOutputMaterial', (900, 0))
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', (620, 0))
    vec, w = torus_coords(nt)

    # pressed cells
    cells = node(nt, 'ShaderNodeTexVoronoi', (-500, 260), feature='F1')
    cells.voronoi_dimensions = '4D'
    cells.inputs['Scale'].default_value = 2.3
    nt.links.new(scaled(nt, vec, 1.0, (-700, 300)), cells.inputs['Vector'])
    nt.links.new(w, cells.inputs['W'])

    # paper fibre
    fibre = node(nt, 'ShaderNodeTexNoise', (-500, -40), noise_dimensions='4D')
    fibre.inputs['Scale'].default_value = 17.0
    fibre.inputs['Detail'].default_value = 8.0
    fibre.inputs['Roughness'].default_value = 0.62
    nt.links.new(vec, fibre.inputs['Vector'])
    nt.links.new(w, fibre.inputs['W'])

    relief = node(nt, 'ShaderNodeMixRGB', (-200, 120), blend_type='ADD')
    relief.inputs['Fac'].default_value = 0.15
    nt.links.new(cells.outputs['Distance'], relief.inputs['Color1'])
    nt.links.new(fibre.outputs['Fac'], relief.inputs['Color2'])

    # ── relief -> normal. Baked as a tangent-space normal map; the browser lights it. ──
    bump = node(nt, 'ShaderNodeBump', (380, -320))
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 0.11
    nt.links.new(relief.outputs['Color'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # ── albedo: near-black stock. ⚠ This is a website background; the colour has to come from
    #    the lighting, not the paint, or nothing can be read on top of it. ──
    base = node(nt, 'ShaderNodeValToRGB', (100, 320))
    base.color_ramp.elements[0].position = 0.05
    base.color_ramp.elements[0].color = (0.0011, 0.0043, 0.0028, 1)
    base.color_ramp.elements[1].position = 0.88
    base.color_ramp.elements[1].color = (0.0052, 0.0115, 0.0082, 1)
    nt.links.new(relief.outputs['Color'], base.inputs['Fac'])

    # ── the foil tint: broad patches that glint green / cyan / magenta / gold, the "holo" in
    #    holographic. Low frequency, so it reads as sheets of foil rather than confetti. ──
    hue = node(nt, 'ShaderNodeTexNoise', (-500, -400), noise_dimensions='4D')
    hue.inputs['Scale'].default_value = 1.7
    nt.links.new(vec, hue.inputs['Vector'])
    nt.links.new(w, hue.inputs['W'])
    hueramp = node(nt, 'ShaderNodeValToRGB', (-200, -400))
    cr = hueramp.color_ramp
    cr.elements[0].position = 0.34
    cr.elements[0].color = (*srgb_to_linear(PHOS), 1)
    cr.elements[1].position = 0.50
    cr.elements[1].color = (*srgb_to_linear(CYAN), 1)
    e2 = cr.elements.new(0.64)
    e2.color = (*srgb_to_linear(ACID), 1)
    e3 = cr.elements.new(0.80)
    e3.color = (*srgb_to_linear(GOLD), 1)
    nt.links.new(hue.outputs['Fac'], hueramp.inputs['Fac'])

    # only the raised cell tops take the foil; the recesses stay matte stock
    foilmask = node(nt, 'ShaderNodeValToRGB', (100, -120))
    foilmask.color_ramp.elements[0].position = 0.38
    foilmask.color_ramp.elements[0].color = (0, 0, 0, 1)
    foilmask.color_ramp.elements[1].position = 0.86
    foilmask.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(relief.outputs['Color'], foilmask.inputs['Fac'])

    tinted = node(nt, 'ShaderNodeMixRGB', (380, 120), blend_type='MIX')
    nt.links.new(foilmask.outputs['Color'], tinted.inputs['Fac'])
    nt.links.new(base.outputs['Color'], tinted.inputs['Color1'])
    # keep the foil dark too — it is a TINT on near-black, not a bright paint
    dim = node(nt, 'ShaderNodeMixRGB', (100, -260), blend_type='MULTIPLY')
    dim.inputs['Fac'].default_value = 1.0
    dim.inputs['Color2'].default_value = (0.040, 0.040, 0.040, 1)
    nt.links.new(hueramp.outputs['Color'], dim.inputs['Color1'])
    nt.links.new(dim.outputs['Color'], tinted.inputs['Color2'])
    nt.links.new(tinted.outputs['Color'], bsdf.inputs['Base Color'])

    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat, nt, bsdf


def save_both(img, stem):
    """Write the shipped WebP AND a lossless PNG beside it.

    ⚑ The PNG is not waste: scripts/build-bg.mjs measures seam continuity and legibility on it
      and then deletes it. Quality is judged on the UNCOMPRESSED pixels — otherwise a failing
      seam check could be blaming WebP's ringing rather than the material — while the size
      budget is judged on the WebP, which is the thing that actually ships. Measure quality on
      the truth, measure cost on the artifact.
    """
    img.filepath_raw = stem + '.png'
    img.file_format = 'PNG'
    img.save()
    img.filepath_raw = stem + '.' + EXT
    img.file_format = FMT
    img.save(quality=QUALITY)
    return stem + '.' + EXT


def bake_plane(size, outdir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    # ⚑ 1 sample is correct here and not a corner cut: the DIFFUSE-COLOR and NORMAL passes are
    #   shader evaluations, not light transport, so extra samples buy literally nothing. (It also
    #   sidesteps this Blender build having no OpenImageDenoise — see the header.)
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.margin = 0          # ⚠ must be 0: a bake margin bleeds pixels ACROSS the
                                          #   tile edge and would undo the seamlessness above

    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.object
    mat, nt, bsdf = stock_material()
    plane.data.materials.append(mat)

    def target(name, is_data):
        img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False,
                                  is_data=is_data)
        tex = node(nt, 'ShaderNodeTexImage', (-1900, -700))
        tex.image = img
        nt.nodes.active = tex
        for n in nt.nodes:
            n.select = False
        tex.select = True
        return img, tex

    outs = {}

    img, tex = target('albedo', False)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    stemA = save_both(img, os.path.join(outdir, 'foil-albedo'))
    outs['albedo'] = stemA
    nt.nodes.remove(tex)

    img, tex = target('normal', True)
    bpy.ops.object.bake(type='NORMAL')
    stemN = save_both(img, os.path.join(outdir, 'foil-normal'))
    outs['normal'] = stemN
    nt.nodes.remove(tex)

    return outs


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else 'media/bg'
    size = int(os.environ.get('BG_SIZE', '1024'))
    os.makedirs(outdir, exist_ok=True)
    outs = bake_plane(size, outdir)
    print('BG_OK size=%d %s' % (size, ' '.join('%s=%s' % kv for kv in outs.items())))


main()

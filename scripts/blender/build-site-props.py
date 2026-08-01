# ripmaster3030studios — the SITE's material set, authored and baked in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-site-props.py -- media/site
#   (or, with the measurement gate: node scripts/build-site-props.mjs)
#
# WHAT IT IS: three seamlessly tiling albedo + tangent-normal pairs for the surfaces the
# non-game pages are MADE of, so the site is built from materials rather than from gradients:
#
#   vinyl — pebbled binder vinyl. The folder's covers and the market bench's leaves.
#   steel — brushed, scuffed nickel. The binder rings, the hardware, the bench top.
#   pulp  — newsprint: paper fibre under a halftone screen. The deck board's cream plates.
#
# Each map is used TWICE and that is the point of baking them rather than drawing them in CSS:
# the browser tiles the albedo behind the flat DOM (works with no WebGL at all), and the same
# pair goes onto the PlayCanvas props in js/site3d-prop.js as diffuseMap + normalMap, where the
# relief is actually lit. One asset, one look, two renderers.
#
# ⚑ SAME CONSTRAINTS AS scripts/blender/build-bg.py, and they were measured there, not guessed:
#   EEVEE cannot run in this container (no libEGL) and Cycles is ~133 s per 640×360 frame with no
#   denoiser, so nothing here RENDERS — it BAKES. A 1-sample DIFFUSE-COLOR or NORMAL pass is a
#   shader evaluation rather than light transport, so extra samples buy literally nothing, and a
#   whole material set costs about a second. WebP, not PNG: a normal map is high-frequency by
#   nature and PNG cannot compress it.
#
# ⚑ SEAMLESS VIA THE 4-D TORUS. Blender's noise is not periodic, so a plain UV lookup cannot
#   tile. Map u,v onto (cos 2πu, sin 2πu, cos 2πv, sin 2πv) and read 4-D noise there: walking u
#   from 0 to 1 walks a full circle and arrives exactly where it started, in every octave, so the
#   tile is periodic BY CONSTRUCTION. Mirroring puts an axis of symmetry across the page and
#   edge-blending puts a soft cross through it; both are visibly wrong on a page-wide surface.
#   ⚠ `torus_coords` below is lifted VERBATIM from build-bg.py rather than imported, because
#     that file calls main() at import time and importing it would kick off a bake. If the trick
#     is ever fixed, it has to be fixed in both — they are the only two copies.
#   ⚑ Anisotropic scaling of that coordinate is still periodic: scaling the (x,y) pair and the
#     (z,w) pair by different factors turns the circle into an ellipse, and an ellipse still
#     closes. That is what lets `steel` have a BRUSH DIRECTION without a seam.
#
# ⚠ TWO OF THESE SIT UNDER TEXT AND THEY SIT UNDER OPPOSITE TEXT. vinyl and steel carry pale
#   phosphor type, so they must stay DARK; pulp carries near-black type, so it must stay LIGHT
#   and must not develop dark specks that read as dirt on a letterform. scripts/build-site-props.mjs
#   measures each one against the polarity it is actually used at and fails the build otherwise.
#
# Everything is procedural — no external image is sampled, so there is nothing to licence.

import sys
import os
import math

import bpy                                                                       # noqa: E402

FMT = os.environ.get('SITE_FMT', 'WEBP')
EXT = 'webp' if FMT == 'WEBP' else 'png'
QUALITY = int(os.environ.get('SITE_QUALITY', '82'))
# see finish(): bakes the raw height field instead of the albedo, so ramp stops can be MEASURED
PROBE = bool(os.environ.get('SITE_PROBE'))

PHOS = (0.043, 1.000, 0.290)     # --phos   #2bff80
CYAN = (0.086, 0.969, 0.894)     # --cyan   #27f7e4


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
    """Uniform scale of the torus vector — 'texture scale' once the coordinate is fixed."""
    m = node(nt, 'ShaderNodeVectorMath', loc, operation='SCALE')
    m.inputs['Scale'].default_value = k
    nt.links.new(vec, m.inputs[0])
    return m.outputs['Vector']


def stretched(nt, vec, w, ku, kv, loc):
    """Anisotropic scale — different rates along u and v, WITHOUT breaking the tiling.

    The u circle lives in components (x, y) and the v circle in (z, w), so scaling (x,y) by ku
    and (z,w) by kv stretches the pattern along one page axis only. Both loops still close, so
    the tile is still seamless. This is the entire mechanism behind `steel`'s brush direction.
    """
    m = node(nt, 'ShaderNodeVectorMath', loc, operation='MULTIPLY')
    m.inputs[1].default_value = (ku, ku, kv)
    nt.links.new(vec, m.inputs[0])
    wm = node(nt, 'ShaderNodeMath', (loc[0], loc[1] - 160), operation='MULTIPLY')
    wm.inputs[1].default_value = kv
    nt.links.new(w, wm.inputs[0])
    return m.outputs['Vector'], wm.outputs[0]


def start(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', (900, 0))
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', (620, 0))
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat, nt, bsdf


def finish(nt, bsdf, height, colour, bump_distance):
    """Every material ends the same way: a height field into a Bump node (baked as the tangent
    normal the browser lights) and a colour into Base Color (baked as the albedo).

    ⚑ SITE_PROBE=1 BAKES THE HEIGHT FIELD ITSELF into the albedo slot, as DATA (no sRGB
      transform), and that is not a debug leftover — it is the only way the colour-ramp stops
      being a guess. A Voronoi's `Distance` output is NOT normalised, and in 4-D its typical
      value is much larger than the 3-D intuition says: the first cut of `vinyl` put its ramp
      stops at 0.04/0.72 on the assumption the height ran 0..1, the height actually ran ~0.45..
      0.75, and more than half the tile came back pinned to the ramp's top colour — a flat
      swatch with sd 2.4 that measured 32.7 mean when it was aimed at 24. Probe, read the
      percentiles, then place the stops on the range the material actually has.
        SITE_PROBE=1 blender --background --factory-startup -P scripts/blender/build-site-props.py
    """
    bump = node(nt, 'ShaderNodeBump', (380, -320))
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = bump_distance
    nt.links.new(height, bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(height if PROBE else colour, bsdf.inputs['Base Color'])


# ── vinyl ────────────────────────────────────────────────────────────────────────────────────
def vinyl_material():
    """Pebbled binder vinyl.

    ⚑ TWO SCALES, an order of magnitude apart, same lesson as the foil: a large voronoi for the
      pebble the grain is embossed into, a fine noise for the sheen texture on top of it. One
      scale alone always reads as a procedural texture; two read as a material.
    ⚠ Near-black on purpose. Pale phosphor type sits on this.
    """
    mat, nt, bsdf = start('vinyl')
    vec, w = torus_coords(nt)

    pebble = node(nt, 'ShaderNodeTexVoronoi', (-500, 260), feature='F1')
    pebble.voronoi_dimensions = '4D'
    pebble.inputs['Scale'].default_value = 11.0
    pebble.inputs['Randomness'].default_value = 0.9
    nt.links.new(vec, pebble.inputs['Vector'])
    nt.links.new(w, pebble.inputs['W'])

    tooth = node(nt, 'ShaderNodeTexNoise', (-500, -40), noise_dimensions='4D')
    tooth.inputs['Scale'].default_value = 46.0
    tooth.inputs['Detail'].default_value = 6.0
    tooth.inputs['Roughness'].default_value = 0.55
    nt.links.new(vec, tooth.inputs['Vector'])
    nt.links.new(w, tooth.inputs['W'])

    relief = node(nt, 'ShaderNodeMixRGB', (-200, 120), blend_type='ADD')
    relief.inputs['Fac'].default_value = 0.22
    nt.links.new(pebble.outputs['Distance'], relief.inputs['Color1'])
    nt.links.new(tooth.outputs['Fac'], relief.inputs['Color2'])

    ramp = node(nt, 'ShaderNodeValToRGB', (100, 320))
    e = ramp.color_ramp
    # ⚑ stops placed on the MEASURED height range (SITE_PROBE: p2 0.357 · p98 0.949), not on the
    #   0..1 the eye assumes. See finish().
    e.elements[0].position = 0.34
    e.elements[0].color = (0.0018, 0.0055, 0.0036, 1)      # recess: the leather's own dark
    e.elements[1].position = 0.95
    e.elements[1].color = (0.0080, 0.0150, 0.0105, 1)      # pebble top, faintly green
    nt.links.new(relief.outputs['Color'], ramp.inputs['Fac'])

    finish(nt, bsdf, relief.outputs['Color'], ramp.outputs['Color'], 0.09)
    return mat, nt, bsdf


# ── steel ────────────────────────────────────────────────────────────────────────────────────
def steel_material():
    """Brushed nickel with scuffs — the rings, the hardware, the bench top.

    ⚑ The BRUSH is the whole identity of this material, and a brush has a DIRECTION. That is the
      anisotropic torus scale: the noise is squeezed ~24x along u and left alone along v, so it
      draws long fine streaks across the page rather than a cloud. Isotropic noise on a metal
      reads as concrete.
    """
    mat, nt, bsdf = start('steel')
    vec, w = torus_coords(nt)

    bvec, bw = stretched(nt, vec, w, 1.0, 24.0, (-900, 260))
    brush = node(nt, 'ShaderNodeTexNoise', (-500, 260), noise_dimensions='4D')
    brush.inputs['Scale'].default_value = 9.0
    brush.inputs['Detail'].default_value = 8.0
    brush.inputs['Roughness'].default_value = 0.72
    nt.links.new(bvec, brush.inputs['Vector'])
    nt.links.new(bw, brush.inputs['W'])

    # scuffs: a second, much coarser stretched layer at a different angle-ish rate, so the metal
    # has history rather than a uniform machine finish
    svec, sw = stretched(nt, vec, w, 7.0, 1.0, (-900, -220))
    scuff = node(nt, 'ShaderNodeTexNoise', (-500, -220), noise_dimensions='4D')
    scuff.inputs['Scale'].default_value = 4.0
    scuff.inputs['Detail'].default_value = 4.0
    nt.links.new(svec, scuff.inputs['Vector'])
    nt.links.new(sw, scuff.inputs['W'])

    relief = node(nt, 'ShaderNodeMixRGB', (-200, 120), blend_type='MIX')
    relief.inputs['Fac'].default_value = 0.30
    nt.links.new(brush.outputs['Fac'], relief.inputs['Color1'])
    nt.links.new(scuff.outputs['Fac'], relief.inputs['Color2'])

    ramp = node(nt, 'ShaderNodeValToRGB', (100, 320))
    e = ramp.color_ramp
    # ⚑ stops on the MEASURED range (SITE_PROBE: p2 0.396 · p98 0.565). Two averaged noises pile
    #   up around their mean far more tightly than a voronoi does — the first cut spread these
    #   stops over 0.22..0.86 and got a flat mid-grey plate (sd 3.3) instead of a brushed one.
    e.elements[0].position = 0.39
    e.elements[0].color = (0.022, 0.026, 0.030, 1)
    e.elements[1].position = 0.57
    e.elements[1].color = (0.155, 0.168, 0.184, 1)         # cool, never warm — this is nickel
    nt.links.new(relief.outputs['Color'], ramp.inputs['Fac'])

    # a faint cyan bloom in the polish, so the hardware belongs to this palette rather than to
    # a stock-photo toolbox
    # ⚠ 0.025, not the 0.10 this started at. SCREEN against a near-saturated cyan adds ~0.093
    #   LINEAR to green at Fac 0.10 — which is nothing on a bright surface and a doubling on a
    #   dark one, so it swamped the ramp entirely: the plate measured mean 112.7 when its own top
    #   colour is only luma 110, and the brush contrast it was supposed to carry collapsed to
    #   sd 3.3. A tint has to be smaller than the thing it is tinting.
    tint = node(nt, 'ShaderNodeMixRGB', (380, 200), blend_type='SCREEN')
    tint.inputs['Fac'].default_value = 0.025
    tint.inputs['Color2'].default_value = (*srgb_to_linear(CYAN), 1)
    nt.links.new(ramp.outputs['Color'], tint.inputs['Color1'])

    finish(nt, bsdf, relief.outputs['Color'], tint.outputs['Color'], 0.035)
    return mat, nt, bsdf


# ── pulp ─────────────────────────────────────────────────────────────────────────────────────
def pulp_material():
    """Newsprint: paper fibre under a halftone screen. The deck board's cream plates.

    ⚑ The HALFTONE is what makes this read as cheap colour printing rather than as paper, and it
      is a real dot grid, not a noise: two sine waves 45° apart, which is how a screen is actually
      ruled. It is deliberately shallow — a dot you can COUNT looks like a bug at 1x zoom, and a
      dot you can only feel is what a comic page looks like.
    ⚠ NEAR-BLACK TYPE SITS ON THIS, so the polarity is inverted from the other two: it must stay
      LIGHT, and the dots must not deepen into specks that read as dirt inside a letterform.
      scripts/build-site-props.mjs bounds the dark tail, not the bright one.
    """
    mat, nt, bsdf = start('pulp')
    vec, w = torus_coords(nt)

    fibre = node(nt, 'ShaderNodeTexNoise', (-500, 260), noise_dimensions='4D')
    fibre.inputs['Scale'].default_value = 28.0
    fibre.inputs['Detail'].default_value = 8.0
    fibre.inputs['Roughness'].default_value = 0.60
    nt.links.new(vec, fibre.inputs['Vector'])
    nt.links.new(w, fibre.inputs['W'])

    # the screen — a 4-D voronoi at a high scale gives a regular-ish dot lattice that still tiles
    dots = node(nt, 'ShaderNodeTexVoronoi', (-500, -40), feature='F1')
    dots.voronoi_dimensions = '4D'
    dots.inputs['Scale'].default_value = 58.0
    dots.inputs['Randomness'].default_value = 0.12      # low randomness = a RULED screen
    nt.links.new(vec, dots.inputs['Vector'])
    nt.links.new(w, dots.inputs['W'])

    relief = node(nt, 'ShaderNodeMixRGB', (-200, 120), blend_type='ADD')
    relief.inputs['Fac'].default_value = 0.34
    nt.links.new(fibre.outputs['Fac'], relief.inputs['Color1'])
    nt.links.new(dots.outputs['Distance'], relief.inputs['Color2'])

    ramp = node(nt, 'ShaderNodeValToRGB', (100, 320))
    e = ramp.color_ramp
    # ⚑ stops on the MEASURED range (SITE_PROBE: p2 0.506 · p98 0.824)
    e.elements[0].position = 0.50
    e.elements[0].color = (0.560, 0.532, 0.428, 1)        # the darkest a fibre may go
    e.elements[1].position = 0.83
    e.elements[1].color = (0.905, 0.880, 0.760, 1)        # warm cream, the plate's own colour
    nt.links.new(relief.outputs['Color'], ramp.inputs['Fac'])

    finish(nt, bsdf, relief.outputs['Color'], ramp.outputs['Color'], 0.020)
    return mat, nt, bsdf


MATERIALS = {
    'vinyl': vinyl_material,
    'steel': steel_material,
    'pulp': pulp_material,
}


def save_both(img, stem):
    """Write the shipped WebP AND a lossless PNG beside it.

    ⚑ The PNG is not waste: scripts/build-site-props.mjs measures seam continuity and legibility on it
      and then deletes it. Quality is judged on the UNCOMPRESSED pixels — otherwise a failing
      seam check could be blaming WebP's ringing rather than the material — while the size budget
      is judged on the WebP, which is the thing that actually ships.
    """
    img.filepath_raw = stem + '.png'
    img.file_format = 'PNG'
    img.save()
    img.filepath_raw = stem + '.' + EXT
    img.file_format = FMT
    img.save(quality=QUALITY)


def bake_one(name, maker, size, outdir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.margin = 0          # ⚠ must be 0: a margin bleeds pixels ACROSS the tile
                                          #   edge and would undo the seamlessness above

    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.object
    mat, nt, bsdf = maker()
    plane.data.materials.append(mat)

    def target(tname, is_data):
        img = bpy.data.images.new(tname, size, size, alpha=False, float_buffer=False,
                                  is_data=is_data)
        tex = node(nt, 'ShaderNodeTexImage', (-1900, -700))
        tex.image = img
        nt.nodes.active = tex
        for n in nt.nodes:
            n.select = False
        tex.select = True
        return img, tex

    img, tex = target(name + '_albedo', PROBE)   # probe output is data, not colour
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
    save_both(img, os.path.join(outdir, name + '-albedo'))
    nt.nodes.remove(tex)

    img, tex = target(name + '_normal', True)
    bpy.ops.object.bake(type='NORMAL')
    save_both(img, os.path.join(outdir, name + '-normal'))
    nt.nodes.remove(tex)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else 'media/site'
    size = int(os.environ.get('SITE_SIZE', '512'))
    only = os.environ.get('SITE_ONLY', '')
    os.makedirs(outdir, exist_ok=True)
    names = [n for n in MATERIALS if not only or n in only.split(',')]
    for n in names:
        bake_one(n, MATERIALS[n], size, outdir)
    print('SITE_OK size=%d %s' % (size, ' '.join(names)))


main()

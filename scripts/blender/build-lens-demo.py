# ripmaster3030studios — THE LAYERED-CARD REFERENCE, authored and baked in Blender.
#
#   blender --background --factory-startup -P scripts/blender/build-lens-demo.py -- media/lens/demo
#   (or just: node scripts/build-lens-demo.mjs)
#
# WHAT IT IS: one card built as FIVE SEPARATE PLATES — backing, arch, subject, embers, foil —
# plus an authored normal map for the two that carry relief, plus a flattened composite for any
# surface that can only take one image. It is the reference implementation of the sidecar schema
# in js/card-layers.js, and the only card in the repo that exercises the layered path.
#
# ⛔ IT IS NOT A CARD IN EITHER DECK, and that is deliberate. The artist's 100 cards are the
#   artist's; inventing a 101st with a title and a rarity would be inventing canon. This is a
#   test plate that says so on its face, kept in media/ rather than cards/.
#
# ⛔ AND IT IS NOT A SEGMENTED PHOTOGRAPH. The obvious shortcut — take one of the 196 flat
#   placeholder cards, key out a background, call the two halves "layers" — would have produced
#   halos, a subject sheared off its own shadow, and a claim that the feature works on a deck
#   where it does not. Layers have to be AUTHORED. So these five are authored, from nothing, in
#   node graphs: every pixel is generated, so there is nothing to licence and nothing to fake.
#
# ⚑ BAKED, NEVER RENDERED — the constraint that decides the whole shape of this file. EEVEE
#   cannot run in this container at all (no libEGL) and Cycles on CPU is ~133 s for one 640x360
#   frame with no denoiser available. But an EMIT or NORMAL bake is a SHADER EVALUATION, not
#   light transport: 1 sample is not a corner cut, extra samples buy literally nothing, and the
#   whole card comes out in seconds. Same reasoning, same numbers, as scripts/blender/build-bg.py.
#
# ⚑ EACH LAYER IS A FLAT PLANE, and the 3D is real anyway. The depth of this card does not come
#   from modelling a scene — it comes from the plates being separated through the card's
#   thickness at runtime and lit by Card3D's key light, which travels as the card turns. So the
#   thing to bake is a stack of RGBA plates and their relief, not a picture of a stack.
#
# ⚑ ALPHA COMES FROM A SECOND BAKE. Blender bakes RGB; the cut-out is baked separately as a
#   greyscale MASK and moved into the colour image's alpha channel in numpy. Doing it as one
#   pass is not available, and faking the cut-out from the colour's own luminance would make
#   every dark pixel transparent — which is exactly the auto-segmentation mistake this file
#   exists to avoid, just applied to our own art instead of the artist's.

import sys
import os
import math

import bpy                                                                       # noqa: E402
import numpy as np                                                               # noqa: E402

FMT = os.environ.get('LENS_FMT', 'WEBP')
EXT = 'webp' if FMT == 'WEBP' else 'png'
QUALITY = int(os.environ.get('LENS_QUALITY', '88'))
W = int(os.environ.get('LENS_W', '1024'))
H = int(W * 3 // 2)                       # 2:3. The card is a SIZE before it is anything else.

GOLD = (1.000, 0.824, 0.231)
ACID = (1.000, 0.086, 0.850)
CYAN = (0.086, 0.969, 0.894)
PHOS = (0.043, 1.000, 0.290)


def s2l(c):
    """Blender is linear; those are the site's sRGB accents. Skipping this washes them out by
    about a stop and they stop reading as the studio's colours."""
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def node(nt, kind, loc=(0, 0), **kw):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in kw.items():
        if '.' in k:
            a, b = k.split('.')
            getattr(n, a)[b].default_value = v
        else:
            setattr(n, k, v)
    return n


def card_space(nt, x=-1500, scale=(1.0, 1.5, 1.0), rot=0.0):
    """UV -> card coordinates: x in [-.5,.5], y in [-.75,.75].

    ⚠ The plate is 2:3, so a circle in UV is an EGG on the card. Every shape below is built in
      this space instead, which is why the arch is round and the subject is not squashed."""
    uv = node(nt, 'ShaderNodeTexCoord', (x - 200, 0))
    m = node(nt, 'ShaderNodeMapping', (x, 0))
    m.inputs['Location'].default_value = (-0.5 * scale[0], -0.5 * scale[1], 0)
    m.inputs['Scale'].default_value = scale
    m.inputs['Rotation'].default_value = (0, 0, rot)
    nt.links.new(uv.outputs['UV'], m.inputs['Vector'])
    return uv, m


def ramp(nt, loc, stops):
    r = node(nt, 'ShaderNodeValToRGB', loc)
    el = r.color_ramp.elements
    while len(el) > 1:
        el.remove(el[-1])
    el[0].position, el[0].color = stops[0][0], stops[0][1]
    for p, c in stops[1:]:
        e = el.new(p)
        e.color = c
    return r


def base_material(name):
    """One Principled BSDF serves both bakes: EMIT reads Emission Color, NORMAL reads the Normal
    input. Two shaders would have been two chances for the colour and the relief to describe
    different pictures."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', (600, 0))
    bsdf = node(nt, 'ShaderNodeBsdfPrincipled', (300, 0))
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Emission Strength'].default_value = 1.0
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat, nt, bsdf


# ── the five plates ──────────────────────────────────────────────────────────────────────────
# Each builder returns (colour_socket, mask_socket_or_None, bump_height_socket_or_None).

def plate_bg(nt):
    """THE BACKING. A vault wall seen from too close: pressed cell relief and paper tooth, lit
    by nothing, because the runtime key light is what will rake across it."""
    _, m = card_space(nt)
    rad = node(nt, 'ShaderNodeTexGradient', (-1200, 200), gradient_type='SPHERICAL')
    sc = node(nt, 'ShaderNodeVectorMath', (-1330, 200), operation='SCALE')
    sc.inputs['Scale'].default_value = 1.35
    nt.links.new(m.outputs['Vector'], sc.inputs[0])
    nt.links.new(sc.outputs['Vector'], rad.inputs['Vector'])
    glow = ramp(nt, (-1000, 260), [(0.00, (*s2l((0.16, 0.05, 0.30)), 1)),
                                   (0.45, (*s2l((0.06, 0.02, 0.13)), 1)),
                                   (1.00, (0.004, 0.004, 0.010, 1))])
    inv = node(nt, 'ShaderNodeMath', (-1120, 120), operation='SUBTRACT')
    inv.inputs[0].default_value = 1.0
    nt.links.new(rad.outputs['Fac'], inv.inputs[1])
    nt.links.new(inv.outputs['Value'], glow.inputs['Fac'])

    cells = node(nt, 'ShaderNodeTexVoronoi', (-1200, -200), feature='DISTANCE_TO_EDGE')
    cells.inputs['Scale'].default_value = 13.0
    nt.links.new(m.outputs['Vector'], cells.inputs['Vector'])
    cramp = ramp(nt, (-1000, -200), [(0.00, (0, 0, 0, 1)), (0.09, (1, 1, 1, 1))])
    nt.links.new(cells.outputs['Distance'], cramp.inputs['Fac'])

    tooth = node(nt, 'ShaderNodeTexNoise', (-1200, -450))
    tooth.inputs['Scale'].default_value = 90.0
    tooth.inputs['Detail'].default_value = 4.0
    nt.links.new(m.outputs['Vector'], tooth.inputs['Vector'])

    # the cell walls catch a hair of the studio's green; the field stays near-black on purpose
    lift = node(nt, 'ShaderNodeMix', (-700, 0), data_type='RGBA', blend_type='ADD')
    lift.inputs['Factor'].default_value = 0.10
    lift.inputs[7].default_value = (*s2l(PHOS), 1)
    nt.links.new(glow.outputs['Color'], lift.inputs[6])

    tint = node(nt, 'ShaderNodeMix', (-450, 0), data_type='RGBA', blend_type='MIX')
    nt.links.new(cramp.outputs['Color'], tint.inputs['Factor'])
    nt.links.new(glow.outputs['Color'], tint.inputs[6])
    nt.links.new(lift.outputs[2], tint.inputs[7])

    # relief: the cell walls are the big form, the tooth is the fine one
    hmix = node(nt, 'ShaderNodeMix', (-450, -350), data_type='FLOAT')
    hmix.inputs['Factor'].default_value = 0.22
    nt.links.new(cramp.outputs['Color'], hmix.inputs[2])
    nt.links.new(tooth.outputs['Fac'], hmix.inputs[3])
    return tint.outputs[2], None, hmix.outputs[0]


def plate_mid(nt):
    """THE ARCH. Concentric rings behind the subject — the layer whose whole job is to be SEEN
    MOVING against the plate behind it, so it is mostly holes."""
    _, m = card_space(nt)
    off = node(nt, 'ShaderNodeVectorMath', (-1330, 0), operation='ADD')
    off.inputs[1].default_value = (0, 0.06, 0)
    nt.links.new(m.outputs['Vector'], off.inputs[0])
    wave = node(nt, 'ShaderNodeTexWave', (-1150, 0), wave_type='RINGS', wave_profile='SIN')
    wave.inputs['Scale'].default_value = 5.2
    wave.inputs['Distortion'].default_value = 1.4
    wave.inputs['Detail'].default_value = 2.0
    nt.links.new(off.outputs['Vector'], wave.inputs['Vector'])
    thin = ramp(nt, (-930, 0), [(0.52, (0, 0, 0, 1)), (0.62, (1, 1, 1, 1)), (0.74, (0, 0, 0, 1))])
    nt.links.new(wave.outputs['Fac'], thin.inputs['Fac'])

    # fade the rings out at the edges, or the layer's own rectangle becomes visible as it slides
    rad = node(nt, 'ShaderNodeTexGradient', (-1150, -300), gradient_type='SPHERICAL')
    sc = node(nt, 'ShaderNodeVectorMath', (-1330, -300), operation='SCALE')
    sc.inputs['Scale'].default_value = 1.5
    nt.links.new(m.outputs['Vector'], sc.inputs[0])
    nt.links.new(sc.outputs['Vector'], rad.inputs['Vector'])
    win = ramp(nt, (-930, -300), [(0.30, (1, 1, 1, 1)), (0.92, (0, 0, 0, 1))])
    nt.links.new(rad.outputs['Fac'], win.inputs['Fac'])

    mask = node(nt, 'ShaderNodeMath', (-650, -150), operation='MULTIPLY')
    nt.links.new(thin.outputs['Color'], mask.inputs[0])
    nt.links.new(win.outputs['Color'], mask.inputs[1])

    hue = ramp(nt, (-650, 200), [(0.00, (*s2l(CYAN), 1)), (0.55, (*s2l((0.35, 0.30, 1.0)), 1)),
                                 (1.00, (*s2l(ACID), 1))])
    nt.links.new(rad.outputs['Fac'], hue.inputs['Fac'])
    lit = node(nt, 'ShaderNodeMix', (-380, 100), data_type='RGBA', blend_type='MULTIPLY')
    lit.inputs['Factor'].default_value = 1.0
    nt.links.new(hue.outputs['Color'], lit.inputs[6])
    nt.links.new(mask.outputs['Value'], lit.inputs[7])
    return lit.outputs[2], mask.outputs['Value'], None


def plate_subject(nt):
    """THE SUBJECT. A domed slug of stock standing off the arch. It carries the relief that
    makes the card read as an object rather than a print, so it gets an authored normal —
    always better than one derived from luminance, which is only ever a guess about what is
    raised."""
    _, m = card_space(nt, scale=(1.0, 1.5, 1.0))
    up = node(nt, 'ShaderNodeVectorMath', (-1400, 0), operation='ADD')
    up.inputs[1].default_value = (0, -0.05, 0)
    nt.links.new(m.outputs['Vector'], up.inputs[0])
    squash = node(nt, 'ShaderNodeVectorMath', (-1250, 0), operation='MULTIPLY')
    squash.inputs[1].default_value = (2.55, 1.62, 1.0)      # an upright oval in card space
    nt.links.new(up.outputs['Vector'], squash.inputs[0])
    rad = node(nt, 'ShaderNodeTexGradient', (-1080, 0), gradient_type='SPHERICAL')
    nt.links.new(squash.outputs['Vector'], rad.inputs['Vector'])

    # a hard-ish silhouette with ~8px of softness — a razor cut reads as a sticker
    mask = ramp(nt, (-880, -220), [(0.30, (0, 0, 0, 1)), (0.345, (1, 1, 1, 1))])
    nt.links.new(rad.outputs['Fac'], mask.inputs['Fac'])
    # the dome: bright at the top-left where Card3D's key comes from, falling to the rim
    dome = ramp(nt, (-880, 120), [(0.28, (0.06, 0.06, 0.09, 1)),
                                  (0.62, (*s2l((0.55, 0.16, 0.62)), 1)),
                                  (0.86, (*s2l(GOLD), 1)),
                                  (1.00, (*s2l((1.0, 1.0, 0.92)), 1))])
    nt.links.new(rad.outputs['Fac'], dome.inputs['Fac'])

    grain = node(nt, 'ShaderNodeTexNoise', (-1080, -520))
    grain.inputs['Scale'].default_value = 42.0
    grain.inputs['Detail'].default_value = 6.0
    nt.links.new(m.outputs['Vector'], grain.inputs['Vector'])
    mottle = node(nt, 'ShaderNodeMix', (-620, 60), data_type='RGBA', blend_type='OVERLAY')
    mottle.inputs['Factor'].default_value = 0.22
    nt.links.new(dome.outputs['Color'], mottle.inputs[6])
    nt.links.new(grain.outputs['Fac'], mottle.inputs[7])

    body = node(nt, 'ShaderNodeMix', (-380, 0), data_type='RGBA', blend_type='MULTIPLY')
    body.inputs['Factor'].default_value = 1.0
    nt.links.new(mottle.outputs[2], body.inputs[6])
    nt.links.new(mask.outputs['Color'], body.inputs[7])

    # relief: the silhouette domes, the grain roughens
    hm = node(nt, 'ShaderNodeMix', (-620, -400), data_type='FLOAT')
    hm.inputs['Factor'].default_value = 0.18
    nt.links.new(mask.outputs['Color'], hm.inputs[2])
    nt.links.new(grain.outputs['Fac'], hm.inputs[3])
    return body.outputs[2], mask.outputs['Color'], hm.outputs[0]


def plate_fx(nt):
    """EMBERS. Additive, and the layer wired to the BURN dial: the more of the token has been
    permanently destroyed, the more of this the card shows. The token burns so the art can
    live — this is that sentence with a number attached."""
    _, m = card_space(nt)
    v = node(nt, 'ShaderNodeTexVoronoi', (-1200, 0), feature='F1')
    v.inputs['Scale'].default_value = 24.0
    v.inputs['Randomness'].default_value = 1.0
    nt.links.new(m.outputs['Vector'], v.inputs['Vector'])
    spark = ramp(nt, (-980, 0), [(0.00, (1, 1, 1, 1)), (0.055, (0, 0, 0, 1))])
    nt.links.new(v.outputs['Distance'], spark.inputs['Fac'])

    drift = node(nt, 'ShaderNodeTexNoise', (-1200, -300))
    drift.inputs['Scale'].default_value = 3.0
    nt.links.new(m.outputs['Vector'], drift.inputs['Vector'])
    thin = node(nt, 'ShaderNodeMath', (-760, -150), operation='MULTIPLY')
    nt.links.new(spark.outputs['Color'], thin.inputs[0])
    nt.links.new(drift.outputs['Fac'], thin.inputs[1])
    lift = node(nt, 'ShaderNodeMath', (-600, -150), operation='POWER')
    lift.inputs[1].default_value = 0.55
    nt.links.new(thin.outputs['Value'], lift.inputs[0])

    warm = node(nt, 'ShaderNodeMix', (-380, 60), data_type='RGBA', blend_type='MULTIPLY')
    warm.inputs['Factor'].default_value = 1.0
    warm.inputs[6].default_value = (*s2l((1.0, 0.55, 0.18)), 1)
    nt.links.new(lift.outputs['Value'], warm.inputs[7])
    return warm.outputs[2], lift.outputs['Value'], None


def plate_foil(nt):
    """THE FOIL SWEEP. ⚠ Baked in RAW UV, not card space, and with an INTEGER band count — this
    is the one plate the renderer scrolls (addressU REPEAT), so it has to be periodic in u or the
    seam walks across the card once per loop."""
    uv = node(nt, 'ShaderNodeTexCoord', (-1500, 0))
    wave = node(nt, 'ShaderNodeTexWave', (-1200, 0), wave_type='BANDS',
                bands_direction='DIAGONAL', wave_profile='SIN')
    wave.inputs['Scale'].default_value = 2.0        # integer periods across u AND v -> tiles
    wave.inputs['Distortion'].default_value = 0.0
    wave.inputs['Detail'].default_value = 0.0
    nt.links.new(uv.outputs['UV'], wave.inputs['Vector'])
    band = ramp(nt, (-980, -200), [(0.42, (0, 0, 0, 1)), (0.50, (1, 1, 1, 1)), (0.58, (0, 0, 0, 1))])
    nt.links.new(wave.outputs['Fac'], band.inputs['Fac'])
    spec = ramp(nt, (-980, 160), [(0.40, (*s2l((0.47, 0.75, 1.0)), 1)),
                                  (0.50, (1, 1, 1, 1)),
                                  (0.60, (*s2l((1.0, 0.55, 0.90)), 1))])
    nt.links.new(wave.outputs['Fac'], spec.inputs['Fac'])
    col = node(nt, 'ShaderNodeMix', (-680, 0), data_type='RGBA', blend_type='MULTIPLY')
    col.inputs['Factor'].default_value = 1.0
    nt.links.new(spec.outputs['Color'], col.inputs[6])
    nt.links.new(band.outputs['Color'], col.inputs[7])
    return col.outputs[2], band.outputs['Color'], None


PLATES = [
    dict(id='bg',      build=plate_bg,      z=0.00, fit='full', relief=1.0, normal=True),
    dict(id='mid',     build=plate_mid,     z=0.34, fit='full', relief=0.0, normal=False),
    dict(id='subject', build=plate_subject, z=0.62, fit='art',  relief=1.0, normal=True),
    dict(id='fx',      build=plate_fx,      z=0.85, fit='full', relief=0.0, normal=False,
         blend='add', drive=dict(gain='burn', min=0.12, max=1.0)),
    dict(id='foil',    build=plate_foil,    z=1.00, fit='full', relief=0.0, normal=False,
         blend='add', foil=True, drive=dict(gain='price', min=0.35, max=1.0)),
]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    # ⚑ 1 sample: an EMIT/NORMAL bake is a shader evaluation, not light transport. See the header.
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    sc.render.bake.use_pass_direct = False
    sc.render.bake.use_pass_indirect = False
    sc.render.bake.margin = 2
    return sc


def bake_to(nt, name, w, h, is_data, kind):
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False, is_data=is_data)
    tex = node(nt, 'ShaderNodeTexImage', (-1900, -900))
    tex.image = img
    nt.nodes.active = tex
    for n in nt.nodes:
        n.select = False
    tex.select = True
    bpy.ops.object.bake(type=kind)
    nt.nodes.remove(tex)
    return img


def px(img):
    a = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape((img.size[1], img.size[0], 4))


def save(img, path, quality=QUALITY):
    img.filepath_raw = path
    img.file_format = FMT
    img.save(quality=quality)
    return path


def build_plate(spec, outdir):
    sc = reset()
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.object
    mat, nt, bsdf = base_material('lens_' + spec['id'])
    plane.data.materials.append(mat)

    col, mask, height = spec['build'](nt)
    nt.links.new(col, bsdf.inputs['Emission Color'])
    if height is not None and spec['normal']:
        bump = node(nt, 'ShaderNodeBump', (60, -300))
        bump.inputs['Strength'].default_value = 0.85
        bump.inputs['Distance'].default_value = 0.06
        nt.links.new(height, bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    out = {}
    cimg = bake_to(nt, spec['id'] + '_c', W, H, False, 'EMIT')

    # ⚑ ALPHA IS A SECOND BAKE, not a threshold on the colour. Swap the emission for the mask,
    #   bake again, move the red channel into the colour image's alpha.
    if mask is not None:
        for l in list(bsdf.inputs['Emission Color'].links):
            nt.links.remove(l)
        nt.links.new(mask, bsdf.inputs['Emission Color'])
        mimg = bake_to(nt, spec['id'] + '_m', W, H, True, 'EMIT')
        a = px(cimg)
        a[:, :, 3] = np.clip(px(mimg)[:, :, 0], 0.0, 1.0)
        cimg.pixels.foreach_set(a.reshape(-1))
        cimg.update()
        bpy.data.images.remove(mimg)
    out['src'] = save(cimg, os.path.join(outdir, spec['id'] + '.' + EXT))

    if spec['normal'] and height is not None:
        for l in list(bsdf.inputs['Emission Color'].links):
            nt.links.remove(l)
        nimg = bake_to(nt, spec['id'] + '_n', W, H, True, 'NORMAL')
        out['normal'] = save(nimg, os.path.join(outdir, spec['id'] + '.n.' + EXT), 92)
        bpy.data.images.remove(nimg)

    rgba = px(cimg)
    out['_rgba'] = rgba.copy()
    out['_add'] = spec.get('blend') == 'add'
    bpy.data.images.remove(cimg)
    return out


def composite(plates, outdir):
    """The single flat plate. Not decoration — cards/lens3d.html's CSS fallback, cards/binder,
    the token's `image` field and every surface that can only take one picture use it, and a
    layered card with no flat version would simply be missing from all of them."""
    acc = None
    for p in plates:
        rgba = p['_rgba']
        if acc is None:
            acc = rgba.copy()
            acc[:, :, 3] = 1.0
            continue
        a = rgba[:, :, 3:4]
        if p['_add']:
            acc[:, :, :3] = np.clip(acc[:, :, :3] + rgba[:, :, :3] * a, 0.0, 1.0)
        else:
            acc[:, :, :3] = acc[:, :, :3] * (1.0 - a) + rgba[:, :, :3] * a
    img = bpy.data.images.new('flat', W, H, alpha=False, float_buffer=False, is_data=False)
    img.pixels.foreach_set(acc.reshape(-1))
    img.update()
    return save(img, os.path.join(outdir, 'flat.' + EXT))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    outdir = argv[0] if argv else 'media/lens/demo'
    os.makedirs(outdir, exist_ok=True)

    built = []
    for spec in PLATES:
        r = build_plate(spec, outdir)
        r['spec'] = spec
        built.append(r)
        print('LENS_PLATE %s %s' % (spec['id'], os.path.basename(r['src'])))
    flat = composite(built, outdir)

    layers = []
    for r in built:
        s = r['spec']
        L = dict(id=s['id'], src=os.path.basename(r['src']), z=s['z'], fit=s['fit'])
        if 'normal' in r:
            L['normal'] = os.path.basename(r['normal'])
        if s['relief']:
            L['relief'] = s['relief']
        if s.get('blend'):
            L['blend'] = s['blend']
        if s.get('foil'):
            L['foil'] = True
        if s.get('drive'):
            L['drive'] = s['drive']
        layers.append(L)

    import json
    side = os.path.join(outdir, 'demo.layers.json')
    with open(side, 'w') as f:
        json.dump({'v': 1, 'size': [W, H], 'title': 'DEPTH TEST',
                   'note': 'Reference implementation of the layered-card schema '
                           '(js/card-layers.js). Generated by scripts/blender/build-lens-demo.py '
                           '- not a card in either deck.',
                   'layers': layers}, f, indent=2)
    print('LENS_OK size=%dx%d layers=%d flat=%s' % (W, H, len(layers), os.path.basename(flat)))


main()

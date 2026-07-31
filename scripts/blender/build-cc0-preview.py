# upperdeckripmaster3030 — render preview sheets for the CC0 asset set.
#
#   blender --background --factory-startup -P scripts/blender/build-cc0-preview.py -- models/cc0 models/cc0/preview
#   (or: npm run cc0 -- --preview)
#
# WHY THIS RE-IMPORTS THE GLB INSTEAD OF RE-RUNNING THE BUILDERS. Rendering from the build
# functions would only prove the build functions render. Importing models/cc0/*.glb proves the
# SHIPPED FILE is what you think it is — it goes through the same export, the same Y-up
# conversion and the same object naming that js/ronin-glb.js will meet. Every preview in
# models/cc0/preview/ is therefore a picture of the actual artefact, not of its recipe.
#
# ⚠ Workbench does not work in this container (libEGL is missing), so this is Cycles on CPU.
# That is slow and it is also better: Workbench's flat shading hides exactly the thing these
# previews exist to check, which is whether a silhouette survives being lit.
#
# THE LIGHTING IS PART OF THE STUDY, NOT DRESSING. The rig is the measured XCOPY palette used as
# a lighting scheme: a black world, a hot magenta key at H≈335 and a cyan fill at H≈185, and NO
# white light anywhere. Near-white measured 0.00% across all five XCOPY works sampled (see
# docs/CC0-SOURCES.md), so a white key would render assets that cannot occur in the palette they
# were designed from. Chromatic highlights are the whole finding; this is it applied.

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy                                                                       # noqa: E402
import kit                                                                       # noqa: E402

HOT = (0.973, 0.000, 0.439)      # #f80070 — measured, "max pain"
COLD = (0.000, 0.439, 0.502)     # #007080 — measured, the same work's other pole
STEEL = (0.282, 0.345, 0.439)    # #485870 — the desaturated mid


def rgb(c, e=1.0):
    return (c[0] * e, c[1] * e, c[2] * e, 1.0)


def aim(obj, loc, target):
    """Point a camera or a lamp at `target` from `loc`.

    ⚠ DERIVED, NOT GUESSED — the guess was wrong and it renders as an empty frame, which is the
    most expensive kind of wrong because nothing errors. Blender's default euler order is XYZ, so
    R = Rz(g)·Ry(b)·Rx(a), and both cameras and area lamps emit along their LOCAL −Z. With b = 0:

        Rx(a)·(0,0,−1) = (0, sin a, −cos a)
        Rz(g)·that     = (−sin g · sin a,  cos g · sin a,  −cos a)

    Setting that equal to the unit direction (dx, dy, dz) gives

        a = atan2(hypot(dx, dy), −dz)        g = atan2(−dx, dy)

    The plausible-looking `atan2(dy, dx) + π/2` is **π out**: it is correct only along ±x and
    flips the y component everywhere else, so a camera set up down the −y axis looks at the
    nothing behind it. Verified numerically at six directions before being used.
    """
    dx, dy, dz = target[0] - loc[0], target[1] - loc[1], target[2] - loc[2]
    obj.location = loc
    obj.rotation_euler = (math.atan2(math.hypot(dx, dy), -dz), 0.0, math.atan2(-dx, dy))
    return obj


def flat_mat(name, colour, rough=0.55, emit=0.0):
    """One Principled BSDF per preview colour. Deliberately plain: the assets carry no materials
    (kit.export_glb strips them on purpose — a baked material is dead weight and one more thing to
    licence-clear), so the preview supplies its own and says so."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = rgb(colour)
    b.inputs['Roughness'].default_value = rough
    if 'Emission Color' in b.inputs:                                    # Blender 4.x
        b.inputs['Emission Color'].default_value = rgb(colour)
        b.inputs['Emission Strength'].default_value = emit
    elif 'Emission' in b.inputs:                                        # 3.x spelling
        b.inputs['Emission'].default_value = rgb(colour, emit)
    return m


def stage(scale=1.0, focus=(0.0, 0.0, 0.45), key=1.0, rim=1.0):
    """Black world + a two-pole chromatic rig, aimed at `focus`.

    ⚠ EXPOSURE IS THE WHOLE JOB HERE AND THE FIRST ATTEMPT GOT IT BACKWARDS. 3000 W area lights
    at size 7 flooded the scene: the floor came out pale lavender, every prop's own colour was
    washed to the same pink, and the sheet looked like a pastel product shot — i.e. exactly the
    thing the XCOPY measurement says the palette never does (near-white 0.00% across all five
    works). A preview that contradicts the study it is illustrating is worse than no preview.
    These numbers are low on purpose: the subject is lit, and two units away it is black.

    `scale` widens the rig for wider subjects rather than brightening it — moving a lamp back and
    keeping its power is what preserves the falloff that makes the black read as black.
    """
    w = bpy.data.worlds.new('w')
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.004, 0.008, 1.0)
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.0

    def lamp(name, loc, colour, energy, size):
        d = bpy.data.lights.new(name, type='AREA')
        d.color = colour
        d.energy = energy * scale * scale        # inverse-square, so power tracks distance²
        d.size = size * scale
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        return aim(o, (loc[0] * scale, loc[1] * scale, loc[2] * scale), focus)

    lamp('key', (2.9, -3.1, 3.0), HOT, 380 * key, 2.2)     # hot key, high and off to one side
    lamp('fill', (-3.6, -1.7, 1.3), COLD, 170, 3.0)        # cold fill, low, opposite
    lamp('rim', (0.0, 4.0, 2.4), STEEL, 210 * rim, 3.0)    # steel rim from behind — lifts off black


def floor(span=9.0):
    """A dark deck, sized to the subject.

    Sized, not huge: a 40-unit plane under a 380 W lamp is mostly unlit floor, and unlit floor
    still bounces enough to grey out the background. The deck should run out of light before it
    runs out of geometry — that falloff into black IS the XCOPY substrate, expressed as staging.
    """
    me = bpy.data.meshes.new('stage_floor')
    s = span
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    me.update()
    o = bpy.data.objects.new('stage_floor', me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(flat_mat('floor', (0.016, 0.017, 0.024), rough=0.62))
    return o


def camera(loc, look, lens=52.0):
    d = bpy.data.cameras.new('cam')
    d.lens = lens
    o = bpy.data.objects.new('cam', d)
    bpy.context.scene.collection.objects.link(o)
    aim(o, loc, look)
    bpy.context.scene.camera = o
    return o


DRAFT = False       # set from argv — quarter res, a sixth of the samples, for iterating on framing


def render(path, w, h, samples=64):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = max(8, samples // 6) if DRAFT else samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 45 if DRAFT else 100
    sc.render.image_settings.file_format = 'PNG'
    # ⚠ Blender's PNG compression defaults to 15%, which on a Cycles render with no denoiser
    # available (see below) is a lot of bytes for nothing — these sheets came out at 4.6 MB
    # between them. 100 is LOSSLESS, just slower to write, and takes about 27% off.
    sc.render.image_settings.compression = 100
    sc.render.film_transparent = False
    # ⚠ 'Standard', NOT Filmic or AgX. Both of those are highlight-rolloff transforms that
    # desaturate as they compress, which is precisely wrong for a palette whose entire finding is
    # "highlights are chromatic and white never appears". Filmic renders #f80070 as dusty rose.
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.filepath = path
    # ⚠ Denoising availability is a BUILD property and asking for it on a build that lacks it is a
    # hard RuntimeError at render time — "Error: Build without OpenImageDenoiser" — not a warning
    # and not something the property assignment rejects. This container's Blender is exactly that
    # build. So it is attempted and then abandoned, rather than assumed either way: a machine with
    # a denoiser gets a clean image at these sample counts, and one without still gets an image.
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError as e:
        if 'Denoiser' not in str(e) and 'denois' not in str(e).lower():
            raise
        print('NOTE no denoiser in this Blender build — re-rendering without it')
        sc.cycles.use_denoising = False
        bpy.ops.render.render(write_still=True)
    ok = os.path.isfile(path) and os.path.getsize(path) > 1024
    print('RENDER %s %s (%dx%d, %d samples)' % ('OK ' if ok else 'FAIL', path, w, h, samples))
    return ok


def import_glb(path):
    """Import and return the objects that arrived. The importer parents meshes to an empty, which
    would fight the layout code, so the parent is cleared and the transform kept."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    return meshes


def bounds(objs):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in objs:
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    return lo, hi


# ── sheet 1: props + environment ─────────────────────────────────────────────────────────────

def sheet_props(src, out):
    kit.reset()
    stage(scale=1.55, focus=(0.0, 0.3, 0.45))
    floor(7.5)
    objs = import_glb(os.path.join(src, 'cc0-props.glb'))
    objs.sort(key=lambda o: o.name)
    # 3×3, not a 9-wide strip. The strip was the first attempt and it cost the sheet its point:
    # nine props across 1600 px is 170 px each, at which a silhouette is a smudge, and the frame
    # only fitted five of them anyway. A grid gives each prop ~450 px and lets the camera sit
    # close enough that the lighting falls off into black instead of flooding the deck.
    PITCH = 1.62
    ROWG = 1.95              # rows recede in +y; > PITCH so the back row clears the front one
    cols = [
        # one skin per prop, chosen from models/cc0/skins.json's lineage groupings so the sheet
        # doubles as a palette test rather than being nine grey lumps
        ('env_bars', STEEL), ('env_deck', (0.20, 0.22, 0.28)), ('env_gate', COLD),
        ('prop_dither', (0.78, 0.73, 0.63)), ('prop_lump', (0.36, 0.16, 0.24)),
        ('prop_scanbar', COLD), ('prop_slate', (0.03, 0.03, 0.06)),
        ('prop_slice', HOT), ('prop_totem', (0.99, 0.31, 0.05)),
    ]
    colour = dict(cols)
    for i, o in enumerate(objs):
        base = o.name.split('.')[0]
        lo, hi = bounds([o])
        col, row = i % 3, i // 3
        o.location = ((col - 1) * PITCH - (lo[0] + hi[0]) / 2.0,
                      (row - 1) * ROWG - (lo[1] + hi[1]) / 2.0,
                      o.location[2] - lo[2])                 # sit it on the deck
        c = colour.get(base, STEEL)
        emit = 0.7 if base in ('prop_slice', 'prop_scanbar', 'env_gate') else 0.0
        o.data.materials.clear()
        o.data.materials.append(flat_mat('m_' + base, c, rough=0.5, emit=emit))
    # Elevation matters as much as distance: at 1.95 of row spacing the camera must sit above
    # atan(1.0/1.95) ≈ 27° or the front row eclipses the back one. 40° leaves headroom.
    camera((0.0, -6.5, 5.3), (0.0, -0.15, 0.34), lens=44.0)
    return render(os.path.join(out, 'props.png'), 1400, 960, samples=80)


# ── sheet 2: the three bodies ────────────────────────────────────────────────────────────────

def sheet_bodies(src, out):
    kit.reset()
    # Key down, rim up. A prop sheet is about surface and a BODY sheet is about silhouette, and
    # silhouette is an edge-lighting problem: a strong key floods the form and flattens exactly
    # the outline you are trying to judge, while the rim is what separates a dark body from a
    # dark floor. Different question, different rig.
    stage(scale=1.25, focus=(0.0, 0.0, 0.55), key=0.62, rim=1.9)
    floor(6.0)
    # ⚠ PITCH must clear the ARM SPAN, not the body. These fighters are authored in the rig's bind
    # pose, where the hand joints sit at x = ±0.40 — so a body is ~0.95 wide even though its torso
    # is ~0.3. The first pass used 1.10 and the three bodies had their fists inside each other.
    PITCH = 1.42
    tints = {'lank': (0.67, 0.64, 1.00), 'squat': (0.96, 0.80, 0.44), 'lump': (0.36, 0.56, 0.21)}
    names = ['lank', 'squat', 'lump']
    for i, nm in enumerate(names):
        objs = import_glb(os.path.join(src, 'cc0-%s.glb' % nm))
        dx = (i - (len(names) - 1) / 2.0) * PITCH
        for o in objs:
            o.location = (o.location[0] + dx, o.location[1], o.location[2])
            o.data.materials.clear()
            # keyline lineage: a flat cel fill. Roughness high so it reads as paint, not plastic —
            # the SMOWLz measurement is flat fills, and a glossy body would contradict the study.
            o.data.materials.append(flat_mat('m_%s_%s' % (nm, o.name), tints[nm], rough=0.80))
    # 3 × 1.42 + one arm span ≈ 4.9 units to cover. sensor 36 mm ⇒ lens ≈ 36·D/W; at D = 4.3 that
    # is ~32 mm. Framed slightly wide so the feet and the deck contact are both visible — a
    # fighter cropped at the ankles tells you nothing about whether it stands.
    camera((0.0, -3.55, 0.86), (0.0, 0.0, 0.50), lens=31.0)
    # 1500×620, not ×780: at 780 the subjects sat in a band through the middle with a quarter of
    # the frame empty sky above and empty deck below. Cropping to the subject is not vanity —
    # a silhouette sheet is judged by how much of the image is silhouette.
    return render(os.path.join(out, 'bodies.png'), 1500, 620, samples=88)


# ── sheet 3: one prop, close, to judge surface rather than silhouette ────────────────────────

def sheet_hero(src, out):
    kit.reset()
    stage(scale=1.0, focus=(0.0, 0.05, 0.50))
    floor(5.0)
    objs = import_glb(os.path.join(src, 'cc0-props.glb'))
    keep = {'prop_slice': HOT, 'prop_totem': (0.99, 0.31, 0.05), 'prop_dither': (0.78, 0.73, 0.63)}
    xs = {'prop_slice': -0.72, 'prop_totem': 0.72, 'prop_dither': 0.02}
    for o in list(objs):
        base = o.name.split('.')[0]
        if base not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        lo, hi = bounds([o])
        o.location = (xs[base] - (lo[0] + hi[0]) / 2.0, -(lo[1] + hi[1]) / 2.0 + (0.55 if base == 'prop_dither' else 0.0), -lo[2])
        o.data.materials.clear()
        # emit 0.55, not 1.4: at 1.4 the slice clipped to flat magenta and lost every one of its
        # displaced band edges — the one thing the hero shot exists to show. Emissive is for
        # separating a shape from black, not for making it the brightest thing in the frame.
        o.data.materials.append(flat_mat('h_' + base, keep[base], rough=0.42,
                                         emit=0.55 if base == 'prop_slice' else 0.0))
    # Distance, derived: three props spanning ~2.4 units need 36·D/lens ≥ 2.4. The first pass sat
    # 2.1 units out on a 70 mm lens — 1.1 units of coverage — and rendered a close-up of a wall.
    camera((0.78, -3.55, 1.18), (0.0, 0.10, 0.46), lens=54.0)
    return render(os.path.join(out, 'hero.png'), 1100, 760, samples=96)


def main():
    global DRAFT
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    src = argv[0] if argv else 'models/cc0'
    out = argv[1] if len(argv) > 1 else 'models/cc0/preview'
    DRAFT = 'draft' in argv[2:]      # framing and exposure are cheap to check and dear to render
    if not os.path.isdir(out):
        os.makedirs(out, exist_ok=True)
    ok = True
    ok &= sheet_props(src, out)
    ok &= sheet_bodies(src, out)
    ok &= sheet_hero(src, out)
    if not ok:
        raise SystemExit('RENDER_FAIL one or more sheets did not write')


main()

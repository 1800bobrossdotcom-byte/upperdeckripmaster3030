# upperdeckripmaster3030 — preview sheets for png23d output.
#
#   blender --background --factory-startup -P scripts/blender/card-preview.py -- models/cards/<name>
#   (or: npm run png23d -- <image> --all --preview)
#
# WHY IT RE-IMPORTS THE GLB. Same argument as build-cc0-preview.py: rendering from the generator
# would only prove the generator. Importing the shipped .glb proves the FILE — its UVs, its
# embedded textures, its normal map, its winding and its material, all going through a third-party
# glTF reader exactly as a marketplace viewer or js/ronin-glb.js would.
#
# ⚠ Workbench does not work in this container (libEGL is missing), so this is Cycles on CPU. That
# is slow and it is also the only honest choice here: Workbench cannot show a normal map at all,
# and "does the normal map do anything" is most of what these sheets exist to answer.
#
# ⚠ MATERIALS ARE THE GLB'S OWN — deliberately NOT replaced with a preview material. The whole
# point of png23d is that the art travels with the mesh; substituting a flat colour would render a
# grey slab and tell us nothing about whether the albedo lines up with the geometry.
#
# THREE COPIES PER RENDER, ONE RENDER PER TECHNIQUE. Flat-on, 32° and 62° of yaw, lit once. A card
# seen dead-on is the one view where every technique here looks identical — the whole question is
# what happens when it moves, so the sheet is mostly the moved views.

import sys
import os
import math
import glob

import bpy                                                                       # noqa: E402

CARD_H = 1.0            # png23d's default --size; the frame maths below assumes it
BG = (0.020, 0.021, 0.028, 1.0)


def aim(obj, loc, target):
    """Point a camera or lamp at `target` from `loc`.

    Lifted verbatim from build-cc0-preview.py, including its derivation: Blender's default euler
    order is XYZ and both cameras and area lamps emit along their LOCAL -Z, so
    a = atan2(hypot(dx,dy), -dz) and g = atan2(-dx, dy). The plausible `atan2(dy,dx) + pi/2` is
    pi out everywhere except along +/-x and renders an empty frame.
    """
    dx, dy, dz = target[0] - loc[0], target[1] - loc[1], target[2] - loc[2]
    obj.location = loc
    obj.rotation_euler = (math.atan2(math.hypot(dx, dy), -dz), 0.0, math.atan2(-dx, dy))
    return obj


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    w = bpy.data.worlds.new('w')
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = BG
    w.node_tree.nodes['Background'].inputs[1].default_value = 1.0


def lamp(name, loc, colour, energy, size, target=(0.0, 0.0, 0.0)):
    d = bpy.data.lights.new(name, type='AREA')
    d.color = colour
    d.energy = energy
    d.size = size
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    return aim(o, loc, target)


def stage():
    """A raking key plus a cool fill — a LIGHTING TEST, not a beauty rig.

    ⚠ The key is deliberately low and off to the side. A card lit head-on is the one setup where a
    normal map, a relief displacement and a plain textured quad are indistinguishable: with L
    parallel to N the diffuse term is ~1 everywhere regardless of the normal, so every technique
    renders the same picture and the sheet proves nothing. Raking light is what makes surface
    relief visible at all, and it is also what a card gets in a phone's media slot as the user
    tilts it past a window.
    """
    lamp('key', (2.35, -1.15, 1.85), (1.0, 0.94, 0.88), 420, 1.6, (0.0, 0.0, 0.15))
    lamp('fill', (-2.4, -2.2, 0.15), (0.55, 0.72, 1.0), 150, 3.0, (0.0, 0.0, 0.0))
    lamp('rim', (-0.4, 2.6, 1.6), (1.0, 0.35, 0.72), 190, 2.4, (0.0, 0.0, 0.0))


def camera(loc, look, lens=58.0):
    d = bpy.data.cameras.new('cam')
    d.lens = lens
    o = bpy.data.objects.new('cam', d)
    bpy.context.scene.collection.objects.link(o)
    aim(o, loc, look)
    bpy.context.scene.camera = o
    return o


def import_glb(path):
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


def label(text, loc, size=0.075):
    """Built-in Bfont text. Emissive so it reads against the near-black world without needing its
    own lamp — a lit label picks up the raking key and half of it falls into shadow."""
    cu = bpy.data.curves.new(type='FONT', name='lbl')
    cu.body = text
    cu.size = size
    cu.align_x = 'CENTER'
    o = bpy.data.objects.new('lbl_' + text, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, 0)
    m = bpy.data.materials.new('lblmat')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.8, 0.8, 0.85, 1)
    if 'Emission Color' in b.inputs:
        b.inputs['Emission Color'].default_value = (0.8, 0.8, 0.85, 1)
        b.inputs['Emission Strength'].default_value = 1.6
    elif 'Emission' in b.inputs:
        b.inputs['Emission'].default_value = (1.3, 1.3, 1.4, 1)
    o.data.materials.append(m)
    return o


DRAFT = False


def render(path, w, h, samples=48):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = max(6, samples // 5) if DRAFT else samples
    sc.cycles.max_bounces = 3
    sc.cycles.use_denoising = True
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 50 if DRAFT else 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.compression = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'      # see build-cc0-preview.py — Filmic desaturates
    sc.view_settings.look = 'None'
    sc.render.filepath = path
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError as e:
        # Denoiser availability is a BUILD property; asking for it on a build without it is a hard
        # RuntimeError at render time, not a rejected assignment. This container is that build.
        if 'denois' not in str(e).lower():
            raise
        print('NOTE no denoiser in this Blender build — re-rendering without it')
        sc.cycles.use_denoising = False
        bpy.ops.render.render(write_still=True)
    ok = os.path.isfile(path) and os.path.getsize(path) > 1024
    print('RENDER %s %s (%dx%d)' % ('OK ' if ok else 'FAIL', path, w, h))
    return ok


def place(objs, x, yaw, pitch=0.0):
    """Move a technique's objects as ONE rigid group about their shared origin.

    ⚠ YAW IS ABOUT Z, AND THAT IS NOT OBVIOUS. Blender's glTF importer BAKES the Y-up→Z-up
    conversion into the vertex data here (measured: the imported object arrives with no parent and
    an identity rotation, local bounds 0.67 x 0.013 x 1.0), so a png23d card lands in the XZ plane
    facing -Y. Turning it "sideways" is therefore Rz, not Ry. The first pass used Ry, which ROLLS
    the card in its own plane — it renders as a slightly crooked flat card and shows none of the
    depth the sheet exists to show.

    ⚠ Rotating each object about its own centre would also be wrong for `layers.glb`, which is
    several quads deliberately offset in z — spinning them individually collapses the parallax the
    file exists to demonstrate, and the render shows the planes stacked flat again.
    """
    for o in objs:
        o.rotation_euler = (pitch, 0.0, yaw)
        o.location = (x, 0.0, 0.0)


def sheet(glb, out, title):
    reset()
    stage()
    PITCH = 0.92
    poses = [(-PITCH, 0.0), (0.0, math.radians(38)), (PITCH, math.radians(68))]
    for i, (x, yaw) in enumerate(poses):
        objs = import_glb(glb)
        place(objs, x, yaw, math.radians(-9) if i else 0.0)
    label(title, (0.0, 0.0, -0.66), 0.072)
    # 3 x 0.92 of pitch = 2.76 units to cover on a 36 mm sensor: lens = 36*D/W. At D = 3.3 that is
    # ~43 mm. Sat back a touch further and slightly above so the bevel on the top edge catches.
    camera((0.0, -3.35, 0.30), (0.0, 0.0, -0.02), lens=42.0)
    return render(out, 1560, 620, samples=52)


def thumbsheet(card_dir, out, names):
    """Every technique in one frame at PHONE SIZE. This is the sheet that decides things.

    A card in a token's media slot is ~300 px tall. Rendering each technique at 500 px flatters
    all of them equally; rendering them at the size they will actually be seen is the only way to
    tell which differences survive. Same tilt for all, same light, no per-technique framing.
    """
    reset()
    stage()
    PITCH = 0.80
    got = []
    for i, nm in enumerate(names):
        p = os.path.join(card_dir, nm + '.glb')
        if not os.path.isfile(p):
            continue
        objs = import_glb(p)
        x = (len(got) - (len(names) - 1) / 2.0) * PITCH
        place(objs, x, math.radians(36), math.radians(-8))
        label(nm, (x, 0.0, -0.62), 0.052)
        got.append(nm)
    if not got:
        return False
    span = len(got) * PITCH
    camera((0.0, -(span * 1.16 + 0.9), 0.24), (0.0, 0.0, -0.03), lens=44.0)
    return render(out, int(min(1800, 300 * len(got) + 120)), 380, samples=56)


def main():
    global DRAFT
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('ERR usage: -- <models/cards/NAME> [outdir] [draft]')
    card_dir = argv[0]
    out = argv[1] if len(argv) > 1 and argv[1] != 'draft' else os.path.join(card_dir, 'preview')
    DRAFT = 'draft' in argv
    os.makedirs(out, exist_ok=True)
    glbs = sorted(glob.glob(os.path.join(card_dir, '*.glb')))
    if not glbs:
        raise SystemExit('ERR no .glb in %s' % card_dir)
    ok = True
    for g in glbs:
        nm = os.path.splitext(os.path.basename(g))[0]
        ok &= sheet(g, os.path.join(out, nm + '.png'), nm)
    ok &= thumbsheet(card_dir, os.path.join(out, '_thumbs.png'),
                     ['relief', 'slab', 'pop', 'silhouette', 'layers', 'voxel'])
    print('SHEET %s %s' % ('OK' if ok else 'PARTIAL', out))


main()

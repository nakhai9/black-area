"""
Blender (Cycles) half of tools/tu160_model_sheet.py: loads the painted Tu-160 mesh (.npz: triangle corners, their
colours, part per triangle), lights it like the tank sheets (tools/blender/t90m_sheet.py) and renders 16 headings of
5 poses (level, banked left, banked right, crash 1, crash 2) into one PNG (16 columns x 5 rows of CELL px).
Run by tu160_model_sheet.py:
    blender -b --factory-startup -P tools/tu160_blender.py -- mesh.npz out.png CELL SCALE ZMID SAMPLES
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
NPZ, OUT = args[0], args[1]
CELL, SCALE, ZMID, SPP = int(args[2]), float(args[3]), float(args[4]), int(args[5])
SS = 2
DIRS = 32  # Red Alert 2 facings, like the tank sheets: column 0 = nose up the screen, clockwise
SIN_E = 0.5
POSES = [(0, 0), (0, -25), (0, 25), (-20, 10), (-35, 30)]  # (pitch, roll) degrees, as aircraft_model_sheet.py rows

# Material per part: (roughness, metallic, ambient-occlusion distance)
LOOK = {
    'glass': (0.08, 0.0, 0.0),
    'nozzle': (0.35, 0.85, 0.4),
    'exhaust': (0.6, 0.6, 0.0),
    'intake': (0.9, 0.0, 0.0),
    'probe': (0.4, 0.7, 0.0),
    'frame': (0.42, 0.5, 0.15),   # windscreen frames: dark painted metal
    'wiper': (0.5, 0.3, 0.0),
    'radome': (0.3, 0.0, 0.3),    # smooth, a little glossier than the paint
}
PAINT = (0.38, 0.0, 0.6)


def stage():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SPP
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = CELL * SS
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'Medium Contrast'
    wd = bpy.data.worlds.new('sky')
    sc.world = wd
    wd.use_nodes = True
    bg = wd.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs['Strength'].default_value = 0.45
    # Key light from the upper left towards the viewer (the game light), a cooler rim from the right.
    key = bpy.data.lights.new('key', 'SUN')
    key.energy = 2.3
    key.angle = math.radians(3)
    ko = bpy.data.objects.new('key', key)
    sc.collection.objects.link(ko)
    ko.rotation_mode = 'QUATERNION'
    ko.rotation_quaternion = Vector((-0.45, -0.35, 0.82)).normalized().to_track_quat('Z', 'Y')
    rim = bpy.data.lights.new('rim', 'SUN')
    rim.energy = 0.9
    rim.color = (0.85, 0.9, 1.0)
    ro = bpy.data.objects.new('rim', rim)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(58), 0, math.radians(-55))
    return sc


def material(name, rough, metal, cavity):
    mt = bpy.data.materials.new(name)
    mt.use_nodes = True
    tree = mt.node_tree
    bsdf = tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    attr = tree.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'paint'
    src = attr.outputs['Color']
    if cavity > 0:
        occ = tree.nodes.new('ShaderNodeAmbientOcclusion')
        occ.inputs['Distance'].default_value = cavity
        tree.links.new(src, occ.inputs['Color'])
        src = occ.outputs['Color']
    tree.links.new(src, bsdf.inputs['Base Color'])
    if name == 'glass':
        bsdf.inputs['Coat Weight'].default_value = 1.0
        # Anti-glare / heating coating: a thin film gives the panes their gold-violet sheen.
        for k, v in (('Thin Film Thickness', 420.0), ('Thin Film IOR', 1.9)):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = v
    return mt


def aircraft():
    d = np.load(NPZ)
    corners, colours, parts, names = d['corners'], d['colours'], d['parts'], [str(n) for n in d['names']]
    n = len(corners) // 3
    me = bpy.data.meshes.new('tu160')
    me.vertices.add(len(corners))
    me.vertices.foreach_set('co', (corners - np.array([0, 0, ZMID])).astype(np.float32).ravel())
    me.loops.add(len(corners))
    me.loops.foreach_set('vertex_index', np.arange(len(corners), dtype=np.int32))
    me.polygons.add(n)
    me.polygons.foreach_set('loop_start', np.arange(0, len(corners), 3, dtype=np.int32))
    me.polygons.foreach_set('loop_total', np.full(n, 3, np.int32))
    looks = {}
    for i, name in enumerate(names):
        r, m, c = LOOK.get(name, PAINT)
        looks[i] = len(me.materials)
        me.materials.append(material(name, r, m, c))
    me.polygons.foreach_set('material_index', np.array([looks[p] for p in parts], np.int32))
    me.update(calc_edges=True)
    ca = me.color_attributes.new('paint', 'FLOAT_COLOR', 'CORNER')
    lin = np.where(colours <= 0.04045, colours / 12.92, ((colours + 0.055) / 1.055) ** 2.4)
    ca.data.foreach_set('color', np.hstack([lin, np.ones((len(lin), 1))]).astype(np.float32).ravel())
    ob = bpy.data.objects.new('tu160', me)
    bpy.context.scene.collection.objects.link(ob)
    # Weld the split corners so the curved skins shade smoothly; sharp edges (wing edges, nacelle corners) stay sharp.
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.002)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    return ob


def main():
    sc = stage()
    ob = aircraft()
    rig = bpy.data.objects.new('rig', None)
    sc.collection.objects.link(rig)
    ob.parent = rig
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = CELL / SCALE
    cam_d.clip_end = 400
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(60), 0, 0)
    cam.location = (cam.rotation_euler.to_quaternion() @ Vector((0, 0, 1))) * 120
    sc.camera = cam
    tmp = OUT + '.tmp.png'
    sheet = np.zeros((CELL * len(POSES), CELL * DIRS, 4), np.float32)
    for r, (pitch, roll) in enumerate(POSES):
        p, q = math.radians(pitch), math.radians(roll)
        cp, sp, cr, sr = math.cos(p), math.sin(p), math.cos(q), math.sin(q)
        rp = np.array([[cp, 0, -sp], [0, 1, 0], [sp, 0, cp]])
        rr = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
        m = rr @ rp
        ob.matrix_basis = Matrix([list(m[0]) + [0], list(m[1]) + [0], list(m[2]) + [0], [0, 0, 0, 1]])
        for k in range(DIRS):
            h = k / DIRS * 2 * math.pi
            rig.rotation_euler = (0, 0, math.atan2(math.cos(h) / SIN_E, math.sin(h)))
            sc.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp)
            px = np.empty(CELL * SS * CELL * SS * 4, np.float32)
            img.pixels.foreach_get(px)
            bpy.data.images.remove(img)
            px = px.reshape(CELL, SS, CELL, SS, 4)
            a = px[..., 3].mean((1, 3))
            rgb = (px[..., :3] * px[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
            cell = np.dstack([rgb, a])[::-1]  # Blender pixels run bottom-up
            sheet[r * CELL:(r + 1) * CELL, k * CELL:(k + 1) * CELL] = cell
            print(f'[tu160] pose {r + 1}/{len(POSES)} heading {k + 1}/{DIRS}', flush=True)
    os.remove(tmp)
    np.save(OUT, sheet)


main()

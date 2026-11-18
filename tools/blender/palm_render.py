"""
Palm tree billboards (date palm FBX models) for the tree sheet: each model rendered from the game's camera angle
(30 deg elevation) at several turns, every view fitted into a PALM_CELL_W x PALM_CELL_H px cell, trunk base at the
bottom centre. Output PNGs go to PALM_OUT (one per view); tools/palm_sheet.py appends them to sprites/trees.png.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/palm_render.py

Env: PALM_FBX=<a.fbx;b.fbx>, PALM_OUT=<dir>, PALM_TURNS=<n> (3).
"""
import math
import os

import bpy
from mathutils import Vector

FBX = [p for p in os.environ["PALM_FBX"].split(";") if p]
OUT = os.environ["PALM_OUT"]
TURNS = int(os.environ.get("PALM_TURNS", "3"))
W, H = 256, 384  # 4x the 64 x 96 sheet cell

for mi, path in enumerate(FBX):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x, sc.render.resolution_y = W, H
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.6, 0.68, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(42), 0, math.radians(205))
    sc.collection.objects.link(sun)
    bpy.ops.import_scene.fbx(filepath=path)
    for o in list(sc.objects):
        if o.type in ("CAMERA", "LIGHT") and o is not sun:
            bpy.data.objects.remove(o)
    meshes = [o for o in sc.objects if o.type == "MESH"]
    root = bpy.data.objects.new("root", None)
    sc.collection.objects.link(root)
    for o in sc.objects:
        if o is not root and o is not sun and o.parent is None:
            o.parent = root
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    root.location = -centre
    bpy.context.view_layer.update()
    size = hi - lo
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    # Frame: height (with the 30 deg tilt) or width, whichever is the tighter fit; base at the bottom.
    span_w = max(size.x, size.y) * 1.05
    span_h = (size.z * math.cos(math.radians(30)) + max(size.x, size.y) * 0.5) * 1.04
    cam.ortho_scale = max(span_w * H / W, span_h)  # ortho_scale is the larger (vertical) side
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    el = math.radians(30)
    d = 200
    co.rotation_euler = (math.radians(60), 0, math.radians(135))
    look = Vector((0, 0, 0))
    fwd = Vector((-math.cos(el) * math.cos(math.radians(45)), -math.cos(el) * math.sin(math.radians(45)), -math.sin(el)))
    up = Vector((-math.sin(el) * math.cos(math.radians(45)), -math.sin(el) * math.sin(math.radians(45)), math.cos(el)))
    # Base point a little above the bottom edge of the frame.
    co.location = look - fwd * d + up * (cam.ortho_scale / 2 - cam.ortho_scale * 0.03 - max(size.x, size.y) * 0.25)
    sc.camera = co
    for t in range(TURNS):
        root.rotation_euler = (0, 0, 2 * math.pi * t / TURNS)
        sc.render.filepath = os.path.join(OUT, f"palm_{mi}_{t}.png")
        bpy.ops.render.render(write_still=True)

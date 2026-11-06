"""
Game sheets for the Blender M1A2 Abrams (abrams_render.py): ui/public/sprites/tank-m1a2-hull.png and tank-m1a2-turret.png,
32 columns of 64 px (screen headings clockwise from N) in one row — the layout TankSheets.ts reads (same as
ui/tools/tank_model_sheet.py): the ground point under the turret ring at PIVOT, orthographic view from 30°, the hull
cell carries the tank's soft shadow, the turret cell is drawn over it and turns on its own.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/abrams_sheet.py
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("ABRAMS_SAMPLES", "32")
import abrams_render as ab  # noqa: E402

CELL, DIRS, SS = 64, 32, 2
OUT = 256  # stored px per cell: 4x the 64 px layout so tanks stay sharp at high zoom (TankSheets reads width / 32)
HULL_PX = 42  # hull length in sheet px
PIVOT = (32, 36)
SIN_E = 0.5
HEIGHT_SCALE = 1.6  # RA2-style chunky look: hull and turret drawn taller than true scale
GUN_SCALE = 0.7  # barrel shortened in the sheets so it stays inside the 64 px cell at every heading
HULL_LEN = 3.75 + 4.02  # m, nose to rear plate
SPRITES = os.path.join(ab.ROOT, "ui", "public", "sprites")
TMP = os.path.join(HERE, "_sheet_tmp.png")


def main():
    ab.reset()
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = OUT * SS
    tank, tur, gun = ab.build(ab.make_materials())
    gun.scale = (GUN_SCALE, 1, 1)
    rig = bpy.data.objects.new("Rig", None)
    sc.collection.objects.link(rig)
    tank.parent = rig
    rig.scale = (1, 1, HEIGHT_SCALE)
    tank.location = (-ab.TURRET_PIVOT[0], 0, 0)  # turret ring over the rig origin
    # game light: from the upper left, towards the viewer (tank_model_sheet.py LIGHT); world -Y is towards the viewer
    L = Vector((-0.45, -0.35, 0.82)).normalized()
    sun = bpy.data.objects["sun"]
    sun.rotation_mode = "QUATERNION"
    sun.rotation_quaternion = L.to_track_quat("Z", "Y")
    scale = HULL_PX / HULL_LEN  # sheet px per m
    cam_d = bpy.data.cameras.new("sheetcam")
    cam_d.type = "ORTHO"
    cam_d.ortho_scale = CELL / scale
    cam_d.clip_end = 300
    cam = bpy.data.objects.new("sheetcam", cam_d)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(60), 0, 0)
    q = cam.rotation_euler.to_quaternion()
    up, back = q @ Vector((0, 1, 0)), q @ Vector((0, 0, 1))
    cam.location = up * ((PIVOT[1] - CELL / 2) / scale) + back * 60
    sc.camera = cam

    turret_objs = [tur] + list(tur.children_recursive)
    turret_set = {o.name for o in turret_objs}
    hull_objs = [o for o in sc.objects if o.type == "MESH" and o.name not in turret_set and o.name != "ShadowCatcher"]
    ground = bpy.data.objects["ShadowCatcher"]

    sheets = {p: np.zeros((OUT, OUT * DIRS, 4), np.float32) for p in ("hull", "turret")}
    for k in range(DIRS):
        h = k / DIRS * 2 * math.pi
        rig.rotation_euler = (0, 0, math.atan2(math.cos(h) / SIN_E, math.sin(h)))
        for part in ("hull", "turret"):
            for o in turret_objs:
                o.visible_camera = part == "turret"
            for o in hull_objs:
                o.visible_camera = part == "hull"
            ground.hide_render = part == "turret"
            sc.render.filepath = TMP
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(TMP)
            px = np.empty(OUT * SS * OUT * SS * 4, np.float32)
            img.pixels.foreach_get(px)
            bpy.data.images.remove(img)
            px = px.reshape(OUT, SS, OUT, SS, 4)
            a = px[..., 3].mean((1, 3))
            rgb = (px[..., :3] * px[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
            sheets[part][:, k * OUT : (k + 1) * OUT, :3] = rgb
            sheets[part][:, k * OUT : (k + 1) * OUT, 3] = a
        print(f"[abrams_sheet] direction {k + 1}/{DIRS}")
    for part, arr in sheets.items():
        im = bpy.data.images.new(f"tank-m1a2-{part}", OUT * DIRS, OUT, alpha=True)
        im.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        im.filepath_raw = os.path.join(SPRITES, f"tank-m1a2-{part}.png")
        im.file_format = "PNG"
        im.save()
        print(f"[abrams_sheet] wrote tank-m1a2-{part}.png")
    os.remove(TMP)


main()

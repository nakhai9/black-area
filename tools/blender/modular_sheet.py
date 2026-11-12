"""
Shared INFRASTRUCTURE for modular trucks (ART_GUIDE 1: camera, sheet export and render passes only — every truck builds
all of its own geometry in its own script, e.g. kamaz_render.py, hemtt_render.py).

A modular truck = CHASSIS (frame, wheels, cab) + MODULES (cargo body now, weapon modules later), all on one rig in real
metres. render_modular() writes:
    <prefix>-chassis.png   chassis + cab, with the whole truck's soft shadow (modules cast it, hidden from the camera)
    <prefix>-<module>.png  each module alone, with the chassis as a HOLDOUT: what stands in front of it is cut away,
                           so the game draws chassis then module and the overlap is right at every heading.
Sheets: 32 columns (column 0 = nose straight up the screen, clockwise), one row, 64 px layout cells stored at OUT px,
ground centre at PIVOT, the tanks' px per metre (PX_PER_M) so the game scale is set in TruckSheets.ts, not here.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

from vehiclekit import model_yaw, node, setup

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(os.path.dirname(os.path.dirname(THIS_DIR)), "ui", "public", "sprites")
CELL, DIRS, SS, OUT = 64, 32, 2, 256
PIVOT = (32, 39)
PX_PER_M = 42 / 7.77  # same sheet px per metre as the tank sheets (t90m_sheet.py HULL_PX / HULL_LEN)
HEIGHT_SCALE = 1.6  # RA2-style chunky look, as the tanks (ART_GUIDE 5)


def camera(sc, pivot=PIVOT):
    cd = bpy.data.cameras.new("sheetcam")
    cd.type = "ORTHO"
    cd.ortho_scale = CELL / PX_PER_M
    cd.clip_end = 300
    cam = bpy.data.objects.new("sheetcam", cd)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(60), 0, 0)
    q = cam.rotation_euler.to_quaternion()
    up, back = q @ Vector((0, 1, 0)), q @ Vector((0, 0, 1))
    cam.location = up * ((pivot[1] - CELL / 2) / PX_PER_M) - Vector((1, 0, 0)) * ((pivot[0] - CELL / 2) / PX_PER_M) + back * 60
    sc.camera = cam


def meshes(ob):
    return [o for o in [ob, *ob.children_recursive] if o.type == "MESH"]


def smooth(objs):
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38), keep_sharp_edges=True)
    for o in objs:
        o.select_set(False)


def shoot(sc, rig, path, n, tag):
    """Renders the headings into one row of OUT px cells (SS supersampled, premultiplied box filter)."""
    big = OUT * SS
    acc = np.zeros((OUT, OUT * n, 4), np.float32)
    tmp = os.path.join(os.environ.get("TEMP", THIS_DIR), f"{os.path.basename(path)}.tmp.png")
    for k in range(n):
        rig.rotation_euler = (0, 0, model_yaw(k if n == DIRS else (4, 12, 20, 28)[k]))
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(tmp)
        buf = np.empty(big * big * 4, np.float32)
        im.pixels.foreach_get(buf)
        bpy.data.images.remove(im)
        buf = buf.reshape(OUT, SS, OUT, SS, 4)
        a = buf[..., 3].mean((1, 3))
        rgb = (buf[..., :3] * buf[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
        acc[:, k * OUT : (k + 1) * OUT, :3] = rgb
        acc[:, k * OUT : (k + 1) * OUT, 3] = a
        print(f"[{tag}] {os.path.basename(path)} {k + 1}/{n}", flush=True)
    img = bpy.data.images.new(os.path.basename(path), OUT * n, OUT, alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    os.remove(tmp)
    print(f"[{tag}] wrote {path}", flush=True)


def render_modular(prefix, build_chassis, modules, make_mats, samples=32, preview=False, pivot=PIVOT):
    """pivot: ground centre in the 64 px cell (lower it for tall loads so the top stays inside the cell; the game draws
    the cell centre at the unit, so a pivot other than PIVOT needs the matching offset in TruckSheets.ts)."""
    """build_chassis(root, M); modules: {name: build(root, M)}; make_mats() -> M. Writes the sheets (see module doc)."""
    sc, floor = setup(OUT * SS, samples)
    camera(sc, pivot)
    M = make_mats()
    rig = node("Rig", (0, 0, 0), None)
    rig.scale = (1, 1, HEIGHT_SCALE)
    chassis = node("Chassis", (0, 0, 0), rig)
    build_chassis(chassis, M)
    roots = {}
    for name, build in modules.items():
        roots[name] = node(f"Module_{name}", (0, 0, 0), rig)
        build(roots[name], M)
    smooth([o for o in sc.objects if o.type == "MESH" and o.name != "Floor"])
    n = 4 if preview else DIRS
    sfx = "-preview" if preview else ""
    first = next(iter(roots), None)
    # 1) chassis + cab; the first module (the stock cargo body) casts its shadow without being seen
    for name, root in roots.items():
        for o in meshes(root):
            o.visible_camera = False
            o.hide_render = name != first
    shoot(sc, rig, os.path.join(SPRITES, f"{prefix}-chassis{sfx}.png"), n, prefix)
    # 2) each module alone, cut away by the chassis in front of it, no ground shadow
    floor.hide_render = True
    for o in meshes(chassis):
        o.is_holdout = True
    for name in roots:
        for other, root in roots.items():
            for o in meshes(root):
                o.hide_render = other != name
                o.visible_camera = True
        shoot(sc, rig, os.path.join(SPRITES, f"{prefix}-{name}{sfx}.png"), n, prefix)

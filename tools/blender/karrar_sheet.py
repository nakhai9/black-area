"""
Karrar main battle tank (Iran, T-72/T-90 lineage) for the Islamic nations, modelled from scratch in Blender after the
parade photos: low cast turret buried under angular ERA (two flared wedge rows on the front, a tall gun-mask box), remote
weapon station on a raised mount, gunner's doghouse with twin windows, long shallow glacis tiled with ERA, angular
fender cheeks with LED lamps, six evenly spaced road wheels, ERA side panels forward and slat cage aft, twin drums on the
rear plate. Desert-grey splinter camouflage. Rendered straight into the game sheets
ui/public/sprites/tank-karrar-hull.png and tank-karrar-turret.png. Self-contained (no code shared with other scripts).

Sheet contract (ui/src/render/TankSheets.ts): 32 cells in one row, screen headings clockwise from North, OUT px per cell
laid out on the 64 px grid with the ground point under the turret ring at ANCHOR, orthographic view 30 deg above the
ground; the hull cell carries the soft shadow, the turret cell is drawn over it and turns on its own.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/karrar_sheet.py

Env: KARRAR_SAMPLES=<n> (default 32); KARRAR_PREVIEW=<file.png> (+ KARRAR_DIR=<0..31>) renders one big frame only.
Axes: +X front, +Y left, +Z up, metres.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(THIS_DIR))
SPRITE_DIR = os.path.join(REPO_ROOT, "ui", "public", "sprites")
SHEET = "karrar"
SCRATCH = os.path.join(THIS_DIR, "_karrar_tmp.png")
SAMPLES = int(os.environ.get("KARRAR_SAMPLES", "32"))
PREVIEW_FILE = os.environ.get("KARRAR_PREVIEW")

LAYOUT_PX, HEADINGS = 64, 32
CELL_PX, OVERSAMPLE = 256, 2
ANCHOR = (32, 36)
VIEW_ELEV = math.radians(30)
LAYOUT_PX_PER_M = 42 / 7.77  # ground scale shared by the game tanks
STRETCH_Z = 1.6
BARREL_FACTOR = 0.62
RING = (-0.35, 0.0, 1.32)  # turret ring centre on the hull deck


def lin_rgba(hexc):
    h = hexc.lstrip("#")
    ch = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in ch) + (1.0,)


def flat_mat(name, hexc, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = lin_rgba(hexc)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m


def splinter_mat(name, scale=0.55):
    """Desert-grey splinter scheme: Voronoi cells (hard polygonal patches) stepped into pale grey, sand grey, charcoal."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.66
    src = nt.nodes.new("ShaderNodeTexCoord")
    cells = nt.nodes.new("ShaderNodeTexVoronoi")
    cells.inputs["Scale"].default_value = scale
    steps = nt.nodes.new("ShaderNodeValToRGB")
    r = steps.color_ramp
    r.interpolation = "CONSTANT"
    r.elements[0].position, r.elements[0].color = 0.0, lin_rgba("#3e3f3d")
    r.elements[1].position, r.elements[1].color = 0.3, lin_rgba("#8f8a7c")
    r.elements.new(0.62).color = lin_rgba("#ada899")
    r.elements.new(0.85).color = lin_rgba("#6c6a63")
    nt.links.new(src.outputs["Object"], cells.inputs["Vector"])
    nt.links.new(cells.outputs["Color"], steps.inputs["Fac"])
    nt.links.new(steps.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def mesh_object(name, bm, mat, parent, bevel=0.0, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    if smooth:
        for poly in me.polygons:
            poly.use_smooth = len(poly.vertices) == 4
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
    return ob


def hull_of(name, pts, mat, parent, bevel=0.015):
    bm = bmesh.new()
    made = [bm.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=made)
    junk = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)}
    if junk:
        bmesh.ops.delete(bm, geom=list(junk), context="VERTS")
    return mesh_object(name, bm, mat, parent, bevel)


def cuboid(name, c, s, mat, parent, bevel=0.01):
    return hull_of(name, [(c[0] + i * s[0] / 2, c[1] + j * s[1] / 2, c[2] + k * s[2] / 2)
                          for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)], mat, parent, bevel)


def cylinder(name, c, radius, length, axis, mat, parent, sides=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=radius, radius2=radius, depth=length)
    ob = mesh_object(name, bm, mat, parent, smooth=True)
    ob.location = c
    ob.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return ob


def node(name, loc, parent):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob


# ------------------------------------------------------------------ Karrar

WHEEL_XS = [-2.45 + i * 0.96 for i in range(6)]
WHEEL_RAD, WHEEL_ZC = 0.39, 0.42
SPROCKET_XZR = (-3.3, 0.6, 0.29)
IDLER_XZR = (3.05, 0.58, 0.28)


def karrar():
    grey = splinter_mat("splinter")
    grey_era = splinter_mat("splinter_era", scale=0.9)
    era_dark = flat_mat("era_dark", "#2e3033", rough=0.55)
    track = flat_mat("track", "#262624", rough=0.7, metal=0.35)
    tyre = flat_mat("tyre", "#1a1a1a", rough=0.92)
    wheel = flat_mat("wheel", "#8c8a82", rough=0.5, metal=0.3)
    gunmetal = flat_mat("gunmetal", "#202224", rough=0.45, metal=0.5)
    window = flat_mat("window", "#2a3a8a", rough=0.08, metal=0.4)
    led = flat_mat("led", "#e8f0e8", rough=0.2)

    root = node("Karrar", (0, 0, 0), None)

    # ---- running gear: six big evenly spaced road wheels (T-72 family)
    for s in (-1, 1):
        loop = []
        for x, z, r in [(x, WHEEL_ZC, WHEEL_RAD) for x in WHEEL_XS] + [SPROCKET_XZR, IDLER_XZR]:
            for k in range(18):
                a = k / 18 * 2 * math.pi
                for y in (1.07, 1.65):
                    loop.append((x + (r + 0.07) * math.cos(a), s * y, z + (r + 0.07) * math.sin(a)))
        hull_of(f"track{s}", loop, track, root, 0.03)
        for i, x in enumerate(WHEEL_XS):
            cylinder(f"tyre{s}{i}", (x, s * 1.36, WHEEL_ZC), WHEEL_RAD, 0.6, "Y", tyre, root)
            cylinder(f"rim{s}{i}", (x, s * 1.67, WHEEL_ZC), WHEEL_RAD - 0.05, 0.03, "Y", wheel, root)
            cylinder(f"hub{s}{i}", (x, s * 1.69, WHEEL_ZC), 0.1, 0.04, "Y", gunmetal, root)
        cylinder(f"sprocket{s}", (SPROCKET_XZR[0], s * 1.36, SPROCKET_XZR[1]), SPROCKET_XZR[2], 0.6, "Y", wheel, root)
        cylinder(f"idler{s}", (IDLER_XZR[0], s * 1.36, IDLER_XZR[1]), IDLER_XZR[2], 0.6, "Y", wheel, root)

    # ---- hull: low, long shallow glacis, steep lower plate
    hull_of("lower_hull", [(x, y, z) for y in (-1.07, 1.07) for x, z in ((-3.45, 0.45), (-3.55, 1.05), (3.15, 0.42), (3.45, 0.98))], grey, root)
    top = []
    for s in (-1, 1):
        top += [(-3.55, s * 1.72, 1.0), (-3.55, s * 1.72, 1.32), (1.85, s * 1.72, 1.32), (3.45, s * 1.62, 1.0), (3.4, s * 1.62, 0.94)]
    hull_of("upper_hull", top, grey, root, 0.025)
    # glacis ERA: tiles in rows on the slope, staggered
    slope = math.atan2(1.32 - 1.0, 3.45 - 1.85)
    gl = node("glacis", (1.85, 0, 1.32), root)
    gl.rotation_euler = (0, slope, 0)
    for row in range(3):
        for k in range(8):
            y = (k - 3.5) * 0.36 + (0.09 if row % 2 else 0)
            if abs(y) > 1.45:
                continue
            mat = era_dark if (row + k) % 3 == 0 else grey_era
            cuboid(f"glacis_era{row}{k}", (0.32 + row * 0.5, y, 0.05), (0.44, 0.32, 0.08), mat, gl)
    for s in (-1, 1):
        # angular fender cheeks with LED lamps
        hull_of(f"cheek{s}", [(2.55, s * 1.2, 1.0), (2.55, s * 1.78, 1.0), (2.55, s * 1.2, 1.36), (2.55, s * 1.78, 1.36),
                              (3.55, s * 1.3, 0.92), (3.55, s * 1.72, 0.92), (3.4, s * 1.3, 1.18), (3.4, s * 1.72, 1.18)], grey, root, 0.02)
        cuboid(f"led_box{s}", (3.1, s * 1.0, 1.15), (0.18, 0.3, 0.16), gunmetal, root)
        cuboid(f"led{s}", (3.2, s * 1.0, 1.15), (0.02, 0.22, 0.08), led, root, 0)
        # ERA side panels forward, slat cage aft
        for k in range(5):
            cuboid(f"side_era{s}{k}", (2.2 - k * 0.5, s * 1.78, 1.05), (0.46, 0.12, 0.5), grey_era if k % 2 else grey, root)
        for k in range(14):
            cuboid(f"slat{s}{k}", (-0.45 - k * 0.22, s * 1.8, 1.0), (0.03, 0.04, 0.6), gunmetal, root, 0)
        for z in (0.72, 1.28):
            cuboid(f"slat_rail{s}{z}", (-1.9, s * 1.8, z), (3.0, 0.05, 0.04), gunmetal, root, 0)
        # twin drums on the rear plate
        cylinder(f"drum{s}", (-3.78, s * 0.62, 1.2), 0.3, 0.85, "Y", grey, root)
        cylinder(f"drum_strap{s}", (-3.78, s * 0.62, 1.2), 0.31, 0.05, "Y", gunmetal, root)
    for k in range(4):
        cuboid(f"engine_grille{k}", (-2.0 - k * 0.42, 0, 1.335), (0.34, 2.2, 0.03), era_dark, root, 0)
    cuboid("driver_hatch", (1.7, 0, 1.34), (0.4, 0.5, 0.05), grey, root)

    # ---- turret: low cast dome
    tur = node("Turret", RING, root)
    dome = []
    for k in range(28):
        a = k / 28 * 2 * math.pi
        rx = 1.45 if math.cos(a) > 0 else 1.35
        dome += [(rx * math.cos(a), 1.2 * math.sin(a), 0.0), (rx * 0.82 * math.cos(a), 0.98 * math.sin(a), 0.55)]
    hull_of("dome", dome, grey, tur, 0.02)
    # two flared rows of wedge ERA across the front quarter, the signature look
    for s in (-1, 1):
        for row, (z0, z1, reach) in enumerate(((0.05, 0.36, 2.05), (0.36, 0.62, 1.8))):
            hull_of(f"wedge{s}{row}", [(0.7, s * 0.38, z0), (0.7, s * 0.38, z1), (-0.1, s * 1.38, z0), (-0.1, s * 1.3, z1),
                                       (reach, s * 0.42, z0 + 0.04), (reach - 0.1, s * 0.42, z1 - 0.04),
                                       (reach * 0.55, s * 1.62, z0 + 0.02), (reach * 0.5, s * 1.55, z1 - 0.02)],
                    grey_era if row else grey, tur, 0.015)
        for k in range(3):  # seams between the ERA bricks
            cuboid(f"wedge_seam{s}{k}", (0.5 + k * 0.4, s * (0.8 + k * 0.05), 0.63), (0.03, 0.55, 0.02), era_dark, tur, 0)
        for k in range(4):
            cylinder(f"smoke{s}{k}", (-0.55 - k * 0.15, s * 1.3, 0.48), 0.06, 0.3, "Y", gunmetal, tur, sides=10)
    # rear stowage bin and its ERA
    hull_of("rear_bin", [(x, s * w, z) for s in (-1, 1) for x, w in ((-1.0, 1.0), (-1.8, 0.85)) for z in (0.12, 0.55)], grey, tur, 0.02)
    # gun mask: tall angular box over the mantlet
    hull_of("gun_mask", [(0.6, s * 0.36, z) for s in (-1, 1) for z in (0.1, 0.62)] +
            [(1.55, s * 0.28, z) for s in (-1, 1) for z in (0.22, 0.55)], grey, tur, 0.015)
    # roof: raised remote weapon station, gunner's doghouse (two windows), commander's cupola, antenna
    cuboid("rws_mount", (-0.2, 0.45, 0.72), (0.5, 0.45, 0.35), gunmetal, tur)
    cuboid("rws_body", (-0.15, 0.45, 1.02), (0.55, 0.35, 0.28), gunmetal, tur)
    cuboid("rws_sight", (0.1, 0.45, 1.25), (0.25, 0.3, 0.2), gunmetal, tur)
    cylinder("rws_gun", (0.4, 0.38, 1.05), 0.035, 0.8, "X", gunmetal, tur, sides=8)
    cuboid("doghouse", (0.35, -0.65, 0.72), (0.5, 0.48, 0.38), grey, tur)
    for k in (-1, 1):
        cuboid(f"doghouse_window{k}", (0.61, -0.65 + k * 0.12, 0.75), (0.02, 0.15, 0.15), window, tur, 0)
    cylinder("cupola", (-0.6, -0.45, 0.62), 0.32, 0.14, "Z", grey, tur)
    cuboid("pano_sight", (-0.45, -0.8, 0.85), (0.24, 0.24, 0.3), gunmetal, tur)
    cylinder("antenna", (-1.1, -0.7, 1.55), 0.015, 2.0, "Z", gunmetal, tur, sides=6)
    cylinder("searchlight", (-0.1, -1.05, 0.72), 0.13, 0.12, "X", gunmetal, tur)

    # ---- 125 mm smoothbore with thermal sleeve
    gun = node("Gun", (1.3, 0, 0.38), tur)
    cylinder("barrel_root", (0.5, 0, 0), 0.15, 1.0, "X", grey, gun)
    cylinder("barrel", (3.0, 0, 0), 0.1, 4.2, "X", grey, gun)
    for k, x in enumerate((1.6, 2.6, 3.6, 4.5)):
        cylinder(f"sleeve{k}", (x, 0, 0), 0.115, 0.07, "X", gunmetal, gun)
    cylinder("muzzle", (5.12, 0, 0), 0.115, 0.12, "X", grey, gun)
    return root, tur, gun


# ------------------------------------------------------------------ stage, sheets


def setup(res):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = "Standard"
    wo = bpy.data.worlds.new("sky")
    sc.world = wo
    wo.use_nodes = True
    wo.node_tree.nodes["Background"].inputs["Color"].default_value = (0.64, 0.66, 0.7, 1)
    wo.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    for name, d, e in (("key", (-0.45, -0.35, 0.82), 3.4), ("fill", (0.5, 0.45, 0.55), 0.5)):
        ld = bpy.data.lights.new(name, "SUN")
        ld.energy = e
        ld.angle = math.radians(4)
        lo = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo)
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = Vector(d).normalized().to_track_quat("Z", "Y")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    floor = mesh_object("Floor", bm, flat_mat("floor", "#ffffff"), None)
    floor.is_shadow_catcher = True
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = LAYOUT_PX / LAYOUT_PX_PER_M
    cd.clip_end = 300
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.pi / 2 - VIEW_ELEV, 0, 0)
    q = cam.rotation_euler.to_quaternion()
    cam.location = (q @ Vector((0, 1, 0))) * ((ANCHOR[1] - LAYOUT_PX / 2) / LAYOUT_PX_PER_M) + (q @ Vector((0, 0, 1))) * 60
    sc.camera = cam
    return sc, floor


def model_yaw(k):
    h = k / HEADINGS * 2 * math.pi
    return math.atan2(math.cos(h) / math.sin(VIEW_ELEV), math.sin(h))


def main():
    sc, floor = setup(512 if PREVIEW_FILE else CELL_PX * OVERSAMPLE)
    root, tur, gun = karrar()
    gun.scale = (BARREL_FACTOR, 1, 1)
    turntable = node("Turntable", (0, 0, 0), None)
    root.parent = turntable
    root.location = (-RING[0], 0, 0)
    turntable.scale = (1, 1, STRETCH_Z)

    if PREVIEW_FILE:
        turntable.rotation_euler = (0, 0, model_yaw(int(os.environ.get("KARRAR_DIR", "4"))))
        tur.rotation_euler = (0, 0, math.radians(-20))
        sc.render.filepath = PREVIEW_FILE
        bpy.ops.render.render(write_still=True)
        return

    turret_names = {o.name for o in [tur] + list(tur.children_recursive)}
    meshes = [o for o in sc.objects if o.type == "MESH" and o is not floor]
    acc = {p: np.zeros((CELL_PX, CELL_PX * HEADINGS, 4), np.float32) for p in ("hull", "turret")}
    n = CELL_PX * OVERSAMPLE
    for k in range(HEADINGS):
        turntable.rotation_euler = (0, 0, model_yaw(k))
        for part in ("hull", "turret"):
            for o in meshes:
                o.visible_camera = (o.name in turret_names) == (part == "turret")
            floor.hide_render = part == "turret"
            sc.render.filepath = SCRATCH
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(SCRATCH)
            buf = np.empty(n * n * 4, np.float32)
            im.pixels.foreach_get(buf)
            bpy.data.images.remove(im)
            buf = buf.reshape(CELL_PX, OVERSAMPLE, CELL_PX, OVERSAMPLE, 4)
            a = buf[..., 3].mean((1, 3))
            rgb = (buf[..., :3] * buf[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
            acc[part][:, k * CELL_PX : (k + 1) * CELL_PX, :3] = rgb
            acc[part][:, k * CELL_PX : (k + 1) * CELL_PX, 3] = a
        print(f"[{SHEET}] direction {k + 1}/{HEADINGS}")
    for part, arr in acc.items():
        img = bpy.data.images.new(f"tank-{SHEET}-{part}", CELL_PX * HEADINGS, CELL_PX, alpha=True)
        img.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        img.filepath_raw = os.path.join(SPRITE_DIR, f"tank-{SHEET}-{part}.png")
        img.file_format = "PNG"
        img.save()
        print(f"[{SHEET}] wrote tank-{SHEET}-{part}.png")
    os.remove(SCRATCH)


main()

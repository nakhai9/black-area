"""
Type 99A (ZTZ-99A) main battle tank for China, built from scratch in Blender after the parade photos (digital camouflage,
arrowhead ERA wedge turret, bustle basket, twin fuel drums on the rear deck, six road wheels behind side skirts) and
rendered straight into the game sheets ui/public/sprites/tank-type99-hull.png and tank-type99-turret.png.
Self-contained: shares no code with the other tank scripts.

Sheet layout (what ui/src/render/TankSheets.ts reads): 32 cells of 64 px in one row, screen headings clockwise from
North, ground point under the turret ring at PIVOT, orthographic view 30 deg above the ground; the hull cell carries the
soft shadow, the turret cell is drawn over it and turns on its own.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/type99_sheet.py

Env: TYPE99_SAMPLES=<n> (default 32), TYPE99_PREVIEW=<file.png> (one large frame for checking, no sheets written).
Axes: +X front, +Y left, +Z up, metres.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SPRITES = os.path.join(ROOT, "ui", "public", "sprites")
TMP = os.path.join(HERE, "_type99_tmp.png")
SPP = int(os.environ.get("TYPE99_SAMPLES", "32"))
PREVIEW = os.environ.get("TYPE99_PREVIEW")

CELL, DIRS, SS = 64, 32, 2
OUT = 256  # stored px per cell: 4x the 64 px layout so tanks stay sharp at high zoom (TankSheets reads width / 32)
PIVOT = (32, 36)
CAM_ELEV = math.radians(30)
PX_PER_M = 42 / 7.77  # same ground scale as the other game tanks
HEIGHT_SCALE = 1.6  # chunky RA2 look
GUN_SCALE = 0.65  # barrel shortened so it stays inside the cell
TURRET_AT = (-0.2, 0.0, 1.35)

# ------------------------------------------------------------------ materials


def lin(hexc):
    h = hexc.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def plain(name, hexc, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*lin(hexc), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def camo(name, cell=0.16, scale=0.9):
    """PLA digital woodland: noise sampled on a snapped grid, stepped into four colours."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    n, ln = nt.nodes, nt.links
    b = n["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.72
    tc = n.new("ShaderNodeTexCoord")
    snap = n.new("ShaderNodeVectorMath")
    snap.operation = "SNAP"
    snap.inputs[1].default_value = (cell, cell, cell)
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 1.0
    ramp = n.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"
    cr.elements[0].position, cr.elements[0].color = 0.0, (*lin("#3a4327"), 1)
    cr.elements[1].position, cr.elements[1].color = 0.4, (*lin("#5c6b3a"), 1)
    for pos, col in ((0.56, "#6e7b47"), (0.66, "#8d6a48")):
        e = cr.elements.new(pos)
        e.color = (*lin(col), 1)
    ln.new(tc.outputs["Object"], snap.inputs[0])
    ln.new(snap.outputs["Vector"], noise.inputs["Vector"])
    ln.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    ln.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return m


# ------------------------------------------------------------------ geometry


def make(name, bm, mat, parent, smooth=False, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = len(p.vertices) == 4  # sides smooth, caps flat
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = "ANGLE"
    return ob


def solid(name, pts, mat, parent, bevel=0.02):
    """Convex solid through the given points."""
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs)
    loose = list({g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)})
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    return make(name, bm, mat, parent, bevel=bevel)


def box(name, c, s, mat, parent, bevel=0.015):
    pts = [(c[0] + i * s[0] / 2, c[1] + j * s[1] / 2, c[2] + k * s[2] / 2) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]
    return solid(name, pts, mat, parent, bevel)


def cyl(name, c, r, length, axis, mat, parent, seg=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=length)
    ob = make(name, bm, mat, parent, smooth=True)
    ob.location = c
    ob.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return ob


def empty(name, loc, parent):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob


# ------------------------------------------------------------------ the Type 99A

WHEELS_X = [-2.55, -1.7, -0.85, 0.0, 0.85, 1.7]
WHEEL_R, WHEEL_Z = 0.38, 0.42
SPROCKET = (-3.3, 0.62, 0.3)  # x, z, r (rear drive)
IDLER = (3.0, 0.62, 0.28)


def build():
    C = camo("camo")
    C_small = camo("camo_fine", cell=0.1, scale=1.3)
    track = plain("track", "#2b2a26", rough=0.75, metal=0.3)
    rubber = plain("rubber", "#1c1c1a", rough=0.9)
    dark = plain("dark", "#262a22", rough=0.5, metal=0.4)
    lens = plain("lens", "#10202a", rough=0.1, metal=0.4)
    canvas = plain("canvas", "#6b5a3e", rough=0.95)
    metal = plain("steel", "#55584c", rough=0.45, metal=0.7)

    root = empty("Type99", (0, 0, 0), None)

    # ---- running gear
    for s in (-1, 1):
        pts = []
        for x, z, r in [(x, WHEEL_Z, WHEEL_R) for x in WHEELS_X] + [SPROCKET, IDLER]:
            for a in range(16):
                t = a / 16 * 2 * math.pi
                for y in (1.08, 1.66):
                    pts.append((x + (r + 0.08) * math.cos(t), s * y, z + (r + 0.08) * math.sin(t)))
        solid(f"track{s}", pts, track, root, bevel=0.03)
        for k, x in enumerate(WHEELS_X):
            cyl(f"wheel{s}{k}", (x, s * 1.4, WHEEL_Z), WHEEL_R, 0.62, "Y", rubber, root)
            cyl(f"hub{s}{k}", (x, s * 1.715, WHEEL_Z), 0.16, 0.04, "Y", C, root)
        cyl(f"sprocket{s}", (SPROCKET[0], s * 1.4, SPROCKET[1]), SPROCKET[2], 0.62, "Y", metal, root)
        cyl(f"idler{s}", (IDLER[0], s * 1.4, IDLER[1]), IDLER[2], 0.62, "Y", metal, root)

    # ---- hull
    solid("lower_hull", [(x, y, z) for y in (-1.08, 1.08) for x, z in ((-3.6, 0.45), (-3.75, 1.0), (3.2, 0.45), (3.75, 0.98))], C, root)
    upper = []
    for s in (-1, 1):
        upper += [(-3.75, s * 1.72, 1.0), (-3.75, s * 1.72, 1.35), (2.3, s * 1.72, 1.35), (3.75, s * 1.6, 1.02), (3.7, s * 1.6, 0.95)]
    solid("upper_hull", upper, C, root, bevel=0.03)
    # glacis ERA plates laid on the slope
    slope = math.atan2(1.35 - 1.02, 3.75 - 2.3)
    gl = empty("glacis", (2.3, 0, 1.35), root)
    gl.rotation_euler = (0, slope, 0)
    for row in range(2):
        for k in range(6):
            y = (k - 2.5) * 0.52
            if abs(y) < 0.3:
                continue  # driver's hatch strip
            box(f"era_glacis{row}{k}", (0.42 + row * 0.62, y, 0.04), (0.56, 0.48, 0.07), C_small, gl)
    cyl("driver_hatch", (2.45, 0, 1.36), 0.24, 0.06, "Z", C, root)
    box("driver_scope", (2.68, 0, 1.39), (0.08, 0.3, 0.06), lens, root)
    for s in (-1, 1):
        box(f"headlight{s}", (3.62, s * 1.42, 1.1), (0.14, 0.2, 0.12), dark, root)
        box(f"headlight_lens{s}", (3.69, s * 1.42, 1.1), (0.02, 0.14, 0.08), lens, root)
        # side skirts, ERA blocks over the front half
        box(f"skirt{s}", (-0.05, s * 1.7, 0.92), (6.6, 0.07, 0.6), C, root, bevel=0.01)
        for k in range(5):
            box(f"era_skirt{s}{k}", (0.95 + k * 0.48, s * 1.77, 0.93), (0.44, 0.08, 0.52), C_small, root, bevel=0.01)
        box(f"mudflap{s}", (-3.55, s * 1.7, 0.95), (0.3, 0.07, 0.5), rubber, root)
        # twin fuel drums across the rear deck
        cyl(f"drum{s}", (-3.5, s * 0.92, 1.66), 0.3, 0.8, "Y", C, root)
        for d in (-0.25, 0.25):
            cyl(f"drum_band{s}{d}", (-3.5, s * 0.92 + d, 1.66), 0.31, 0.04, "Y", dark, root)
    for k in range(3):
        box(f"deck_grille{k}", (-3.05 + k * 0.45, 0, 1.37), (0.36, 1.5, 0.03), dark, root)
    box("rear_plate_box", (-3.8, 0, 1.15), (0.12, 1.2, 0.25), C, root)

    # ---- turret
    tur = empty("Turret", TURRET_AT, root)
    body = []
    for s in (-1, 1):
        body += [(-2.0, s * 1.15, 0.0), (-2.0, s * 1.1, 0.62), (0.4, s * 1.3, 0.0), (0.4, s * 1.25, 0.62)]
    solid("turret_body", body, C, tur, bevel=0.03)
    for s in (-1, 1):  # arrowhead ERA wedge, split for the gun
        solid(f"wedge{s}", [(0.4, s * 0.28, 0.05), (0.4, s * 0.28, 0.6), (0.4, s * 1.32, 0.05), (0.4, s * 1.27, 0.6),
                            (1.8, s * 0.3, 0.12), (1.8, s * 0.3, 0.5)], C_small, tur, bevel=0.02)
        for k in range(4):
            cyl(f"smoke{s}{k}", (-0.05 - k * 0.17, s * 1.33, 0.48), 0.06, 0.3, "Y", dark, tur, seg=10)
        cyl(f"antenna{s}", (-1.75, s * 0.95, 1.6), 0.015, 2.0, "Z", dark, tur, seg=6)
        box(f"laser_warn{s}", (-0.3, s * 1.2, 0.72), (0.14, 0.14, 0.14), dark, tur)
    box("mantlet", (0.95, 0, 0.32), (1.0, 0.5, 0.42), C, tur)
    # bustle basket with stowage
    box("basket_back", (-2.48, 0, 0.45), (0.05, 2.3, 0.05), metal, tur, bevel=0)
    for s in (-1, 1):
        box(f"basket_side{s}", (-2.24, s * 1.15, 0.45), (0.5, 0.05, 0.05), metal, tur, bevel=0)
        box(f"basket_post{s}", (-2.48, s * 1.15, 0.27), (0.05, 0.05, 0.4), metal, tur, bevel=0)
    box("stowage", (-2.24, 0, 0.27), (0.42, 2.0, 0.38), canvas, tur, bevel=0.04)
    # roof: commander's cupola + remote MG, panoramic sight, gunner's sight
    cyl("cupola", (-0.7, -0.6, 0.7), 0.3, 0.16, "Z", C, tur)
    box("mg_body", (-0.62, -0.6, 0.92), (0.34, 0.12, 0.18), dark, tur)
    cyl("mg_barrel", (-0.15, -0.6, 0.95), 0.03, 0.8, "X", dark, tur, seg=8)
    cyl("pano_sight", (-0.35, -0.15, 0.82), 0.13, 0.38, "Z", C, tur)
    box("pano_head", (-0.35, -0.15, 1.05), (0.28, 0.24, 0.16), dark, tur)
    box("gunner_sight", (0.15, 0.65, 0.78), (0.45, 0.32, 0.32), C, tur)
    box("gunner_lens", (0.385, 0.65, 0.78), (0.02, 0.2, 0.14), lens, tur, bevel=0)
    cyl("loader_hatch", (-0.8, 0.55, 0.64), 0.26, 0.05, "Z", C, tur)

    # ---- 125 mm gun
    gun = empty("Gun", (1.2, 0, 0.32), tur)
    cyl("barrel", (2.9, 0, 0), 0.095, 5.0, "X", C, gun)
    cyl("fume_extractor", (2.6, 0, 0), 0.16, 0.7, "X", C, gun)
    for k, x in enumerate((1.2, 1.9, 3.6, 4.4)):
        cyl(f"sleeve{k}", (x, 0, 0), 0.115, 0.08, "X", dark, gun)
    cyl("muzzle", (5.35, 0, 0), 0.11, 0.1, "X", dark, gun)
    box("mrs", (5.2, 0, 0.13), (0.12, 0.05, 0.07), dark, gun)
    return root, tur, gun


# ------------------------------------------------------------------ stage + sheets


def stage(res):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SPP
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.66, 0.72, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    # game light: from the upper left, towards the viewer (world -Y faces the viewer)
    for name, d, e in (("sun", (-0.45, -0.35, 0.82), 3.6), ("fill", (0.5, 0.4, 0.6), 0.5)):
        ld = bpy.data.lights.new(name, "SUN")
        ld.energy = e
        ld.angle = math.radians(4)
        lo = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo)
        lo.rotation_mode = "QUATERNION"
        lo.rotation_quaternion = Vector(d).normalized().to_track_quat("Z", "Y")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    floor = make("Floor", bm, plain("floor", "#ffffff"), None)
    floor.is_shadow_catcher = True
    return sc, floor


def camera(sc):
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = CELL / PX_PER_M
    cd.clip_end = 300
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.pi / 2 - CAM_ELEV, 0, 0)
    q = cam.rotation_euler.to_quaternion()
    up, back = q @ Vector((0, 1, 0)), q @ Vector((0, 0, 1))
    cam.location = up * ((PIVOT[1] - CELL / 2) / PX_PER_M) + back * 60
    sc.camera = cam


def heading_to_yaw(k):
    """Screen heading k (clockwise from North) to the model's yaw, undoing the camera's foreshortening."""
    h = k / DIRS * 2 * math.pi
    return math.atan2(math.cos(h) / math.sin(CAM_ELEV), math.sin(h))


def main():
    sc, floor = stage(512 if PREVIEW else OUT * SS)
    root, tur, gun = build()
    gun.scale = (GUN_SCALE, 1, 1)
    rig = empty("Rig", (0, 0, 0), None)
    root.parent = rig
    root.location = (-TURRET_AT[0], 0, 0)
    rig.scale = (1, 1, HEIGHT_SCALE)
    camera(sc)

    if PREVIEW:
        rig.rotation_euler = (0, 0, heading_to_yaw(int(os.environ.get("TYPE99_DIR", "4"))))
        tur.rotation_euler = (0, 0, math.radians(-25))
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        return

    turret_objs = {o.name for o in [tur] + list(tur.children_recursive)}
    meshes = [o for o in sc.objects if o.type == "MESH" and o is not floor]
    sheets = {p: np.zeros((OUT, OUT * DIRS, 4), np.float32) for p in ("hull", "turret")}
    for k in range(DIRS):
        rig.rotation_euler = (0, 0, heading_to_yaw(k))
        for part in ("hull", "turret"):
            for o in meshes:
                o.visible_camera = (o.name in turret_objs) == (part == "turret")
            floor.hide_render = part == "turret"
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
        print(f"[type99] direction {k + 1}/{DIRS}")
    for part, arr in sheets.items():
        im = bpy.data.images.new(f"tank-type99-{part}", OUT * DIRS, OUT, alpha=True)
        im.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        im.filepath_raw = os.path.join(SPRITES, f"tank-type99-{part}.png")
        im.file_format = "PNG"
        im.save()
        print(f"[type99] wrote tank-type99-{part}.png")
    os.remove(TMP)


main()

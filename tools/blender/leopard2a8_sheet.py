"""
Leopard 2A8 main battle tank for Europe, built from scratch in Blender after the Leopard 2 AV blueprint and 2A8 photos:
slab-sided turret with the swept arrowhead wedge armour, big overhanging bustle, PERI commander's sight + remote MG,
EMES gunner's doghouse, long L/55 smoothbore, seven road wheels under deep side skirts (armoured front skirts), flat deck
with the two round fan grates. NATO green/black camouflage. Rendered straight into the game sheets
ui/public/sprites/tank-leopard2a8-hull.png and tank-leopard2a8-turret.png. Self-contained (no code shared with others).

Sheet layout (what ui/src/render/TankSheets.ts reads): 32 cells in one row, screen headings clockwise from North; cells
are OUT px but laid out on the 64 px grid (ground point under the turret ring at PIVOT), orthographic view 30 deg above
the ground; the hull cell carries the soft shadow, the turret cell is drawn over it and turns on its own.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/leopard2a8_sheet.py

Env: LEO_SAMPLES=<n> (default 32), LEO_PREVIEW=<file.png> one large frame (LEO_DIR=<0..31>), no sheets written.
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
NAME = "leopard2a8"
TMP = os.path.join(HERE, "_leo_tmp.png")
SPP = int(os.environ.get("LEO_SAMPLES", "32"))
PREVIEW = os.environ.get("LEO_PREVIEW")

GRID, DIRS = 64, 32  # layout grid of the game sheets
OUT, SSAA = 256, 2  # stored px per cell, supersampling
PIVOT = (32, 36)
ELEV = math.radians(30)
M_TO_GRID = 42 / 7.77  # grid px per metre, shared ground scale of the game tanks
TALL = 1.6  # chunky RA2 look
GUN_LEN = 0.6  # barrel shortened so it stays inside the cell
TURRET_RING = (0.1, 0.0, 1.42)


def srgb(hexc):
    h = hexc.lstrip("#")
    out = []
    for i in (0, 2, 4):
        v = int(h[i : i + 2], 16) / 255
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def paint(name, hexc, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = srgb(hexc)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    return m


def nato_camo(name, scale=0.42):
    """Large soft-edged blotches: black over two greens (stepped noise in object space)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    p = nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = 0.78
    coords = nodes.new("ShaderNodeTexCoord")
    tex = nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 2.0
    tex.inputs["Roughness"].default_value = 0.45
    steps = nodes.new("ShaderNodeValToRGB")
    ramp = steps.color_ramp
    ramp.interpolation = "CONSTANT"
    ramp.elements[0].position, ramp.elements[0].color = 0.0, srgb("#1c201b")
    ramp.elements[1].position, ramp.elements[1].color = 0.43, srgb("#34432c")
    ramp.elements.new(0.58).color = srgb("#4a5a3c")
    links.new(coords.outputs["Object"], tex.inputs["Vector"])
    links.new(tex.outputs["Fac"], steps.inputs["Fac"])
    links.new(steps.outputs["Color"], p.inputs["Base Color"])
    return m


def to_object(name, bm, mat, parent, round_edges=0.0, smooth=False):
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
    if round_edges:
        bev = ob.modifiers.new("edges", "BEVEL")
        bev.width = round_edges
        bev.segments = 1
        bev.limit_method = "ANGLE"
    return ob


def shell(name, points, mat, parent, round_edges=0.02):
    """Convex body spanned by the points."""
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in points]
    res = bmesh.ops.convex_hull(bm, input=verts)
    stray = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)}
    if stray:
        bmesh.ops.delete(bm, geom=list(stray), context="VERTS")
    return to_object(name, bm, mat, parent, round_edges)


def block(name, centre, size, mat, parent, round_edges=0.012):
    cx, cy, cz = centre
    sx, sy, sz = (v / 2 for v in size)
    return shell(name, [(cx + a * sx, cy + b * sy, cz + c * sz) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)], mat, parent, round_edges)


def rod(name, centre, radius, length, axis, mat, parent, sides=20):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=radius, radius2=radius, depth=length)
    ob = to_object(name, bm, mat, parent, smooth=True)
    ob.location = centre
    ob.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return ob


def pivot(name, loc, parent):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob


# ------------------------------------------------------------------ Leopard 2A8

ROAD_WHEELS = [-2.65 + i * 0.87 for i in range(7)]
WHEEL_R, WHEEL_Z = 0.35, 0.38
DRIVE = (-3.45, 0.62, 0.3)  # x, z, r: rear sprocket
IDLER = (3.25, 0.6, 0.29)


def model():
    camo = nato_camo("camo")
    camo_b = nato_camo("camo_b", scale=0.6)
    track = paint("track", "#272824", rough=0.7, metal=0.35)
    rubber = paint("rubber", "#18191a", rough=0.92)
    steel = paint("steel", "#3d4237", rough=0.45, metal=0.6)
    black = paint("black", "#151714", rough=0.5, metal=0.3)
    glass = paint("glass", "#0b1820", rough=0.08, metal=0.5)
    grate = paint("grate", "#202420", rough=0.6, metal=0.5)

    tank = pivot("Leopard2A8", (0, 0, 0), None)

    # ---- tracks, seven road wheels a side
    for s in (-1, 1):
        ring = []
        for x, z, r in [(x, WHEEL_Z, WHEEL_R) for x in ROAD_WHEELS] + [DRIVE, IDLER]:
            for k in range(18):
                a = k / 18 * 2 * math.pi
                for y in (1.17, 1.8):
                    ring.append((x + (r + 0.08) * math.cos(a), s * y, z + (r + 0.08) * math.sin(a)))
        shell(f"track{s}", ring, track, tank, 0.03)
        for i, x in enumerate(ROAD_WHEELS):
            rod(f"roadwheel{s}{i}", (x, s * 1.49, WHEEL_Z), WHEEL_R, 0.66, "Y", rubber, tank)
            rod(f"wheeldisc{s}{i}", (x, s * 1.83, WHEEL_Z), 0.27, 0.03, "Y", camo_b, tank)
            rod(f"wheelhub{s}{i}", (x, s * 1.85, WHEEL_Z), 0.09, 0.03, "Y", steel, tank)
        rod(f"sprocket{s}", (DRIVE[0], s * 1.49, DRIVE[1]), DRIVE[2], 0.66, "Y", steel, tank)
        rod(f"idler{s}", (IDLER[0], s * 1.49, IDLER[1]), IDLER[2], 0.66, "Y", steel, tank)

    # ---- hull: box body, shallow upper glacis, steep nose, vertical rear plate
    shell("belly", [(x, y, z) for y in (-1.17, 1.17) for x, z in ((-3.75, 0.5), (-3.9, 1.1), (3.35, 0.45), (3.8, 1.12))], camo, tank)
    deck = []
    for s in (-1, 1):
        deck += [(-3.92, s * 1.86, 1.08), (-3.92, s * 1.86, 1.42), (2.35, s * 1.86, 1.42), (3.82, s * 1.8, 1.17), (3.8, s * 1.8, 1.08)]
    shell("deck", deck, camo, tank, 0.03)
    block("mine_plate", (2.6, 0, 0.4), (1.6, 2.1, 0.1), camo_b, tank)
    block("driver_hatch", (2.25, 0.62, 1.44), (0.6, 0.55, 0.05), camo_b, tank)
    for k in range(3):
        block(f"driver_periscope{k}", (2.6, 0.45 + k * 0.17, 1.46), (0.08, 0.13, 0.06), glass, tank, 0)
    # engine deck: two round fan grates (right rear) and the long grilles
    for k, x in enumerate((-2.25, -3.1)):
        rod(f"fan{k}", (x, -0.75, 1.435), 0.38, 0.03, "Z", grate, tank, sides=32)
        rod(f"fan_hub{k}", (x, -0.75, 1.45), 0.08, 0.03, "Z", black, tank)
    for k in range(4):
        block(f"grille{k}", (-1.85 - k * 0.5, 0.75, 1.435), (0.4, 1.1, 0.03), grate, tank, 0)
    block("rear_grille", (-3.94, 0, 0.95), (0.05, 2.4, 0.4), grate, tank, 0)
    for s in (-1, 1):
        # deep side skirts: armoured front section, light rear section
        block(f"skirt_front{s}", (2.45, s * 1.92, 0.86), (2.4, 0.13, 0.66), camo, tank)
        for k in range(4):
            block(f"skirt_seam{s}{k}", (1.4 + k * 0.62, s * 1.99, 0.86), (0.03, 0.02, 0.6), black, tank, 0)
        block(f"skirt_rear{s}", (-1.2, s * 1.89, 0.9), (5.0, 0.05, 0.5), camo, tank, 0.008)
        block(f"headlight_guard{s}", (3.62, s * 1.52, 1.27), (0.3, 0.3, 0.16), camo_b, tank)
        block(f"headlight{s}", (3.76, s * 1.52, 1.27), (0.02, 0.18, 0.08), glass, tank, 0)
        block(f"rear_box{s}", (-3.55, s * 1.55, 1.58), (0.6, 0.55, 0.32), camo_b, tank)
        block(f"tail_light{s}", (-3.95, s * 1.62, 1.25), (0.03, 0.14, 0.08), black, tank, 0)

    # ---- turret: vertical slab sides, flat roof, overhanging bustle
    tur = pivot("Turret", TURRET_RING, tank)
    shell("turret_body", [(x, s * w, z) for s in (-1, 1) for x, w in ((-1.6, 1.38), (0.95, 1.45)) for z in (0.0, 0.8)], camo, tur, 0.025)
    shell("bustle", [(x, s * w, z) for s in (-1, 1) for x, w, zs in ((-1.5, 1.38, (0.15, 0.8)), (-2.75, 1.2, (0.25, 0.78))) for z in zs], camo, tur, 0.025)
    for s in (-1, 1):
        # swept arrowhead wedge, top falling towards the tip
        shell(f"wedge{s}", [(0.95, s * 0.36, 0.08), (0.95, s * 0.36, 0.8), (0.95, s * 1.5, 0.08), (0.95, s * 1.5, 0.8),
                            (2.2, s * 0.4, 0.14), (2.2, s * 0.4, 0.55)], camo, tur, 0.02)
        block(f"side_armour{s}", (-0.35, s * 1.5, 0.42), (2.6, 0.1, 0.72), camo_b, tur)
        block(f"trophy{s}", (-0.95, s * 1.6, 0.55), (0.55, 0.16, 0.42), camo_b, tur)
        block(f"trophy_radar{s}", (0.35, s * 1.57, 0.62), (0.4, 0.06, 0.3), black, tur, 0.005)
        for row in range(2):
            for k in range(4):
                rod(f"smoke{s}{row}{k}", (-1.45 - k * 0.15, s * (1.32 + row * 0.1), 0.85 + row * 0.1), 0.055, 0.25, "Y", black, tur, sides=10)
        rod(f"antenna{s}", (-2.4, s * 0.95, 1.75), 0.014, 1.9, "Z", black, tur, sides=6)
    block("mantlet", (1.2, 0, 0.45), (0.6, 0.62, 0.55), camo_b, tur)
    # stowage basket on the bustle rear
    block("basket", (-2.95, 0, 0.55), (0.4, 2.2, 0.4), grate, tur, 0)
    # roof: EMES gunner's doghouse front right, commander's PERI + remote MG, loader's hatch
    block("emes_box", (0.55, -0.9, 0.98), (0.55, 0.45, 0.36), camo, tur)
    block("emes_glass", (0.83, -0.9, 0.98), (0.02, 0.32, 0.18), glass, tur, 0)
    rod("cmdr_hatch", (-0.55, -0.6, 0.83), 0.33, 0.07, "Z", camo_b, tur)
    rod("peri_mast", (-0.15, -0.95, 1.05), 0.12, 0.5, "Z", camo, tur)
    block("peri_head", (-0.15, -0.95, 1.38), (0.36, 0.32, 0.26), camo_b, tur)
    block("peri_glass", (0.04, -0.95, 1.38), (0.02, 0.22, 0.12), glass, tur, 0)
    block("rws_base", (-1.2, -0.55, 0.92), (0.5, 0.45, 0.22), camo_b, tur)
    block("rws_body", (-1.15, -0.55, 1.13), (0.42, 0.22, 0.26), black, tur)
    rod("rws_mg", (-0.65, -0.55, 1.15), 0.03, 0.75, "X", black, tur, sides=8)
    rod("loader_hatch", (-0.55, 0.6, 0.83), 0.32, 0.06, "Z", camo_b, tur)
    rod("wind_sensor", (-2.1, -0.2, 1.05), 0.02, 0.5, "Z", black, tur, sides=6)

    # ---- 120 mm L/55 smoothbore
    gun = pivot("Gun", (1.35, 0, 0.45), tur)
    rod("gun_root", (0.55, 0, 0), 0.16, 0.9, "X", camo_b, gun)
    rod("barrel", (3.5, 0, 0), 0.1, 5.2, "X", camo, gun)
    for k, x in enumerate((1.8, 2.9, 4.0, 5.1)):
        rod(f"sleeve_band{k}", (x, 0, 0), 0.115, 0.07, "X", black, gun)
    rod("muzzle", (6.08, 0, 0), 0.118, 0.16, "X", camo_b, gun)
    block("muzzle_ref", (5.9, 0, 0.14), (0.14, 0.06, 0.08), black, gun, 0)
    return tank, tur, gun


# ------------------------------------------------------------------ studio + sheets


def studio(px):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SPP
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = px
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("sky")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.66, 0.72, 1)
    bg.inputs["Strength"].default_value = 0.8
    # key light from the upper left towards the viewer (world -Y faces the viewer), weak fill opposite
    for name, d, e in (("key", (-0.45, -0.35, 0.82), 3.8), ("fill", (0.5, 0.45, 0.55), 0.6)):
        sun = bpy.data.lights.new(name, "SUN")
        sun.energy = e
        sun.angle = math.radians(4)
        ob = bpy.data.objects.new(name, sun)
        sc.collection.objects.link(ob)
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = Vector(d).normalized().to_track_quat("Z", "Y")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    ground = to_object("Ground", bm, paint("ground", "#ffffff"), None)
    ground.is_shadow_catcher = True
    cam_data = bpy.data.cameras.new("view")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = GRID / M_TO_GRID
    cam_data.clip_end = 300
    cam = bpy.data.objects.new("view", cam_data)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.pi / 2 - ELEV, 0, 0)
    q = cam.rotation_euler.to_quaternion()
    cam.location = (q @ Vector((0, 1, 0))) * ((PIVOT[1] - GRID / 2) / M_TO_GRID) + (q @ Vector((0, 0, 1))) * 60
    sc.camera = cam
    return sc, ground


def yaw_for(k):
    """Model yaw that shows screen heading k (clockwise from North) through the foreshortened camera."""
    h = k / DIRS * 2 * math.pi
    return math.atan2(math.cos(h) / math.sin(ELEV), math.sin(h))


def main():
    sc, ground = studio(512 if PREVIEW else OUT * SSAA)
    tank, tur, gun = model()
    gun.scale = (GUN_LEN, 1, 1)
    stand = pivot("Stand", (0, 0, 0), None)
    tank.parent = stand
    tank.location = (-TURRET_RING[0], 0, 0)
    stand.scale = (1, 1, TALL)

    if PREVIEW:
        stand.rotation_euler = (0, 0, yaw_for(int(os.environ.get("LEO_DIR", "4"))))
        tur.rotation_euler = (0, 0, math.radians(-20))
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        return

    on_turret = {o.name for o in [tur] + list(tur.children_recursive)}
    parts = [o for o in sc.objects if o.type == "MESH" and o is not ground]
    out = {p: np.zeros((OUT, OUT * DIRS, 4), np.float32) for p in ("hull", "turret")}
    for k in range(DIRS):
        stand.rotation_euler = (0, 0, yaw_for(k))
        for part in ("hull", "turret"):
            for o in parts:
                o.visible_camera = (o.name in on_turret) == (part == "turret")
            ground.hide_render = part == "turret"
            sc.render.filepath = TMP
            bpy.ops.render.render(write_still=True)
            shot = bpy.data.images.load(TMP)
            px = np.empty(OUT * SSAA * OUT * SSAA * 4, np.float32)
            shot.pixels.foreach_get(px)
            bpy.data.images.remove(shot)
            px = px.reshape(OUT, SSAA, OUT, SSAA, 4)
            alpha = px[..., 3].mean((1, 3))
            rgb = (px[..., :3] * px[..., 3:4]).mean((1, 3)) / np.maximum(alpha, 1e-6)[..., None]
            out[part][:, k * OUT : (k + 1) * OUT, :3] = rgb
            out[part][:, k * OUT : (k + 1) * OUT, 3] = alpha
        print(f"[{NAME}] direction {k + 1}/{DIRS}")
    for part, arr in out.items():
        img = bpy.data.images.new(f"tank-{NAME}-{part}", OUT * DIRS, OUT, alpha=True)
        img.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        img.filepath_raw = os.path.join(SPRITES, f"tank-{NAME}-{part}.png")
        img.file_format = "PNG"
        img.save()
        print(f"[{NAME}] wrote tank-{NAME}-{part}.png")
    os.remove(TMP)


main()

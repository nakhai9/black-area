"""
K9 Thunder 155 mm self-propelled howitzer, built from scratch in Blender after the K9 three-view blueprints and photos:
long low hull with the engine at the front right and the driver front left, sloped glacis with the folding barrel
travel lock, six road wheels a side (front drive sprocket, rear idler), large box turret set to the rear, overhanging
the hull sides, 155 mm L/52 barrel with fume extractor and multi-baffle muzzle brake, roof .50 cal MG on the
commander's cupola, rear stowage racks and two whip antennas. Moss-green (xanh rêu) paint.

Real size, metres (K9 data sheet): hull 7.44 long, 3.40 wide, 2.73 high (turret roof), 12.0 long overall with the gun
forward, ground clearance 0.41. The ground scale is the one shared by every game tank (M_TO_GRID, grid px per metre
on the 64 px 1x1 tile grid); the cell is 96 grid px wide so the real-length barrel fits without being cut. The game
can scale the sprite up in code later.

Faction colour: every part made of the TEAM material (turret side bands, rear turret panel, roof ID panel) is also
rendered alone into tank-k9thunder-team.png (grey shading, alpha = coverage). The game tints that mask with the owner's
hex colour and draws it over the hull/turret cell (multiply). K9_TEAM=#rrggbb bakes one colour into the main sheets
instead of the neutral grey (preview / single-faction use).

Sheets (same layout as ui/src/render/TankSheets.ts): 32 cells in one row, screen headings clockwise from North,
OUT px per cell, ground point under the turret ring at PIVOT, orthographic camera 30 deg above the ground.
    tank-k9thunder-hull.png         hull + soft shadow
    tank-k9thunder-turret.png       turret + gun, drawn over the hull, turns on its own
    tank-k9thunder-hull-team.png    faction mask for the hull cells
    tank-k9thunder-turret-team.png  faction mask for the turret cells

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/k9thunder_sheet.py

Env: K9_SAMPLES=<n> (default 32), K9_TEAM=#rrggbb, K9_PREVIEW=<file.png> one large frame (K9_DIR=<0..31>), no sheets.
Axes: +X front (u), +Y left (v), +Z up (z), metres.
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
NAME = "k9thunder"
TMP = os.path.join(HERE, "_k9_tmp.png")
SPP = int(os.environ.get("K9_SAMPLES", "32"))
PREVIEW = os.environ.get("K9_PREVIEW")
TEAM_HEX = os.environ.get("K9_TEAM", "#c8c8c8")  # neutral grey: the mask carries the faction colour

GRID, DIRS = 96, 32  # layout grid px per cell (1x1 tile = 64 grid px), facings
OUT, SSAA = 384, 2  # stored px per cell (4x grid), supersampling
PIVOT = (48, 54)
ELEV = math.radians(30)
M_TO_GRID = 42 / 7.77  # grid px per metre, shared ground scale of the game tanks
TALL = 1.0  # real height (raise to 1.6 for the chunky RA2 look)
TURRET_RING = (-1.0, 0.0, 1.62)

MOSS = "#4b5631"  # xanh rêu
MOSS_DARK = "#3c4527"


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


def moss(name, hexc):
    """Military moss green with light grime (4 % noise), never blotchy."""
    m = paint(name, hexc, rough=0.72)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    p = nodes["Principled BSDF"]
    coords = nodes.new("ShaderNodeTexCoord")
    tex = nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 3.0
    tex.inputs["Detail"].default_value = 4.0
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.04
    mix.inputs["A"].default_value = srgb(hexc)
    links.new(coords.outputs["Object"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], mix.inputs["B"])
    links.new(mix.outputs["Result"], p.inputs["Base Color"])
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


# ------------------------------------------------------------------ K9 Thunder

ROAD_WHEELS = [2.35 - i * 0.98 for i in range(6)]
WHEEL_R, WHEEL_Z = 0.33, 0.36
DRIVE = (3.2, 0.78, 0.3)  # x, z, r: front drive sprocket
IDLER = (-3.35, 0.72, 0.28)  # rear idler
TRACK_IN, TRACK_OUT = 1.15, 1.68


def model():
    paint_main = moss("moss", MOSS)
    paint_dark = moss("moss_dark", MOSS_DARK)
    team = paint("TEAM", TEAM_HEX, rough=0.55)
    track = paint("track", "#26272a", rough=0.7, metal=0.35)
    rubber = paint("rubber", "#18191a", rough=0.92)
    steel = paint("steel", "#3c4034", rough=0.42, metal=0.65)
    black = paint("black", "#151714", rough=0.5, metal=0.3)
    glass = paint("glass", "#0b1820", rough=0.08, metal=0.5)
    grate = paint("grate", "#1f231c", rough=0.6, metal=0.5)

    k9 = pivot("K9", (0, 0, 0), None)

    # ---- running gear: six road wheels, front sprocket, rear idler, three return rollers
    for s in (-1, 1):
        ring = []
        for x, z, r in [(x, WHEEL_Z, WHEEL_R) for x in ROAD_WHEELS] + [DRIVE, IDLER]:
            for k in range(18):
                a = k / 18 * 2 * math.pi
                for y in (TRACK_IN, TRACK_OUT):
                    ring.append((x + (r + 0.08) * math.cos(a), s * y, z + (r + 0.08) * math.sin(a)))
        shell(f"track{s}", ring, track, k9, 0.03)
        for k in range(26):  # track link ribs on the top run
            x = -3.2 + k * 0.25
            block(f"link{s}{k}", (x, s * (TRACK_IN + TRACK_OUT) / 2, 1.165), (0.06, TRACK_OUT - TRACK_IN, 0.03), black, k9, 0)
        for i, x in enumerate(ROAD_WHEELS):
            rod(f"roadwheel{s}{i}", (x, s * 1.41, WHEEL_Z), WHEEL_R, 0.56, "Y", rubber, k9)
            rod(f"wheeldisc{s}{i}", (x, s * 1.70, WHEEL_Z), 0.26, 0.03, "Y", paint_dark, k9)
            rod(f"wheelhub{s}{i}", (x, s * 1.72, WHEEL_Z), 0.08, 0.03, "Y", steel, k9)
        for i, x in enumerate((1.85, 0.0, -1.85)):
            rod(f"return{s}{i}", (x, s * 1.45, 0.98), 0.1, 0.4, "Y", rubber, k9)
        rod(f"sprocket{s}", (DRIVE[0], s * 1.41, DRIVE[1]), DRIVE[2], 0.56, "Y", steel, k9)
        for k in range(10):
            a = k / 10 * 2 * math.pi
            block(f"tooth{s}{k}", (DRIVE[0] + 0.33 * math.cos(a), s * 1.41, DRIVE[1] + 0.33 * math.sin(a)), (0.08, 0.3, 0.08), steel, k9, 0)
        rod(f"idler{s}", (IDLER[0], s * 1.41, IDLER[1]), IDLER[2], 0.56, "Y", steel, k9)

    # ---- hull: flat deck, long upper glacis, steep lower nose, vertical rear plate
    profile = ((-3.72, 0.5), (-3.72, 1.62), (2.2, 1.62), (3.62, 1.2), (3.72, 0.95), (3.2, 0.48))
    shell("hull", [(x, s * 1.15, z) for s in (-1, 1) for x, z in profile], paint_main, k9, 0.025)
    # sponsons / fenders over the tracks, full 3.40 m width
    for s in (-1, 1):
        shell(f"fender{s}", [(x, s * y, z) for y in (1.15, 1.7) for x, z in
                             ((-3.72, 1.3), (-3.72, 1.62), (2.2, 1.62), (3.55, 1.24), (3.55, 1.16), (-3.72, 1.16))], paint_main, k9, 0.015)
        block(f"fender_lip{s}", (-0.1, s * 1.7, 1.25), (7.2, 0.03, 0.18), paint_dark, k9, 0)
        block(f"headlight_guard{s}", (3.3, s * 1.25, 1.42), (0.22, 0.28, 0.16), paint_dark, k9)
        block(f"headlight{s}", (3.42, s * 1.25, 1.42), (0.02, 0.16, 0.08), glass, k9, 0)
        block(f"tail_light{s}", (-3.74, s * 1.45, 1.42), (0.03, 0.14, 0.08), black, k9, 0)
        block(f"tow_hook{s}", (3.68, s * 0.7, 0.9), (0.14, 0.12, 0.14), steel, k9)
        # side stowage boxes on the fenders, ahead of the turret
        block(f"fender_box{s}", (1.55, s * 1.48, 1.74), (0.9, 0.38, 0.26), paint_dark, k9)
    # driver's hatch + periscopes, front left
    rod("driver_hatch", (2.05, 0.75, 1.64), 0.3, 0.05, "Z", paint_dark, k9)
    for k in range(3):
        block(f"driver_periscope{k}", (2.4, 0.55 + k * 0.2, 1.62), (0.08, 0.14, 0.07), glass, k9, 0)
    # engine at the front right: intake and exhaust grilles on the deck
    for k in range(4):
        block(f"engine_grille{k}", (1.0 + k * 0.38, -0.65, 1.63), (0.32, 0.95, 0.03), grate, k9, 0)
    block("exhaust_grille", (2.55, -1.0, 1.52), (0.5, 0.25, 0.06), grate, k9, 0)
    # barrel travel lock: A-frame folded down on the glacis
    for s in (-1, 1):
        rod(f"travel_lock_leg{s}", (2.85, s * 0.18, 1.48), 0.035, 0.9, "X", steel, k9, sides=8)
    block("travel_lock_cradle", (3.28, 0, 1.36), (0.14, 0.45, 0.1), steel, k9)
    # rear: big door, step and spade-less tow pintle
    block("rear_door", (-3.75, -0.3, 1.0), (0.05, 0.95, 0.85), paint_dark, k9)
    block("rear_step", (-3.82, 0, 0.62), (0.18, 1.8, 0.05), steel, k9, 0)

    # ---- turret (local: ring centre at the origin), large box set to the rear, overhanging the hull sides
    tur = pivot("Turret", TURRET_RING, k9)
    body = []
    for s in (-1, 1):
        body += [(-2.72, s * 1.6, 0.0), (-2.72, s * 1.6, 1.08), (1.95, s * 1.6, 1.08), (2.3, s * 1.55, 0.55),
                 (2.2, s * 1.5, 0.0)]
    shell("turret_body", body, paint_main, tur, 0.03)
    block("mantlet", (2.45, 0, 0.55), (0.45, 0.85, 0.72), paint_dark, tur)
    for s in (-1, 1):
        # faction band along each turret side
        block(f"team_band{s}", (-0.35, s * 1.615, 0.72), (4.4, 0.02, 0.2), team, tur, 0)
        # side doors / ammo hatches, vision blocks, smoke grenade launchers at the front corners
        block(f"side_hatch{s}", (-1.6, s * 1.615, 0.35), (0.7, 0.02, 0.45), paint_dark, tur, 0)
        for k in range(4):
            rod(f"smoke{s}{k}", (1.75, s * (1.25 + k * 0.1), 1.15), 0.055, 0.25, "X", black, tur, sides=10)
        rod(f"antenna{s}", (-2.45, s * 1.35, 2.05), 0.014, 1.9, "Z", black, tur, sides=6)
        rod(f"antenna_base{s}", (-2.45, s * 1.35, 1.14), 0.06, 0.12, "Z", black, tur, sides=10)
    # rear stowage racks with gear + faction panel on the turret rear
    block("rear_rack", (-2.9, 0, 0.62), (0.35, 3.0, 0.7), grate, tur, 0)
    for k, y in enumerate((-1.0, -0.3, 0.45, 1.1)):
        block(f"rack_bag{k}", (-2.92, y, 0.66), (0.3, 0.55, 0.45), paint_dark, tur)
    block("team_rear", (-2.74, 0, 0.98), (0.02, 1.4, 0.16), team, tur, 0)
    # roof: commander's cupola with .50 cal MG (right), gunner's sight (left), loader's hatch, roof faction panel
    rod("cupola", (0.6, -0.85, 1.14), 0.36, 0.14, "Z", paint_dark, tur)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        block(f"cupola_vision{k}", (0.6 + 0.37 * math.cos(a), -0.85 + 0.37 * math.sin(a), 1.16), (0.06, 0.1, 0.06), glass, tur, 0)
    block("mg_cradle", (0.65, -0.85, 1.36), (0.35, 0.16, 0.2), black, tur)
    rod("mg_barrel", (1.25, -0.85, 1.38), 0.025, 1.0, "X", black, tur, sides=8)
    block("mg_ammo", (0.55, -0.68, 1.33), (0.2, 0.12, 0.14), paint_dark, tur)
    block("sight_box", (1.5, 0.95, 1.22), (0.45, 0.35, 0.28), paint_dark, tur)
    block("sight_glass", (1.73, 0.95, 1.22), (0.02, 0.24, 0.12), glass, tur, 0)
    rod("loader_hatch", (-0.5, 0.75, 1.1), 0.33, 0.05, "Z", paint_dark, tur)
    block("team_roof", (-1.4, 0, 1.085), (0.9, 0.9, 0.01), team, tur, 0)
    block("roof_vent", (-0.6, -0.6, 1.12), (0.35, 0.35, 0.1), grate, tur, 0)

    # ---- 155 mm L/52 howitzer: 8.06 m tube, fume extractor, multi-baffle muzzle brake
    gun = pivot("Gun", (2.65, 0, 0.55), tur)
    rod("gun_root", (0.3, 0, 0), 0.2, 0.7, "X", paint_dark, gun)
    rod("barrel", (4.3, 0, 0), 0.115, 7.5, "X", paint_main, gun)
    rod("fume_extractor", (3.4, 0, 0), 0.17, 1.0, "X", paint_main, gun)
    for x in (2.9, 3.9):
        rod(f"fume_taper{x}", (x, 0, 0), 0.145, 0.06, "X", paint_dark, gun)
    for k in range(5):  # muzzle brake: baffles with dark ports between
        rod(f"brake_baffle{k}", (7.75 + k * 0.13, 0, 0), 0.19, 0.07, "X", paint_dark, gun)
        rod(f"brake_port{k}", (7.81 + k * 0.13, 0, 0), 0.15, 0.06, "X", black, gun)
    rod("muzzle", (8.4, 0, 0), 0.17, 0.08, "X", paint_dark, gun)
    return k9, tur, gun


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
    sc.view_settings.look = "Medium Contrast"
    world = bpy.data.worlds.new("sky")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.66, 0.72, 1)
    bg.inputs["Strength"].default_value = 0.6
    for name, d, e, col in (("key", (-0.45, -0.35, 0.82), 3.0, (1, 0.98, 0.94)), ("rim", (0.6, 0.4, 0.5), 0.9, (0.85, 0.9, 1))):
        sun = bpy.data.lights.new(name, "SUN")
        sun.energy = e
        sun.color = col
        sun.angle = math.radians(3)
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


def grab(sc):
    sc.render.filepath = TMP
    bpy.ops.render.render(write_still=True)
    shot = bpy.data.images.load(TMP)
    px = np.empty(OUT * SSAA * OUT * SSAA * 4, np.float32)
    shot.pixels.foreach_get(px)
    bpy.data.images.remove(shot)
    px = px.reshape(OUT, SSAA, OUT, SSAA, 4)
    alpha = px[..., 3].mean((1, 3))
    rgb = (px[..., :3] * px[..., 3:4]).mean((1, 3)) / np.maximum(alpha, 1e-6)[..., None]
    return rgb, alpha


def main():
    sc, ground = studio(512 if PREVIEW else OUT * SSAA)
    k9, tur, gun = model()
    stand = pivot("Stand", (0, 0, 0), None)
    k9.parent = stand
    k9.location = (-TURRET_RING[0], 0, 0)
    stand.scale = (1, 1, TALL)

    if PREVIEW:
        stand.rotation_euler = (0, 0, yaw_for(int(os.environ.get("K9_DIR", "4"))))
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        return

    on_turret = {o.name for o in [tur] + list(tur.children_recursive)}
    parts = [o for o in sc.objects if o.type == "MESH" and o is not ground]
    is_team = {o.name for o in parts if o.active_material and o.active_material.name == "TEAM"}
    sheets = ("hull", "turret", "hull-team", "turret-team")
    out = {p: np.zeros((OUT, OUT * DIRS, 4), np.float32) for p in sheets}
    for k in range(DIRS):
        stand.rotation_euler = (0, 0, yaw_for(k))
        for sheet in sheets:
            want_turret = sheet.startswith("turret")
            mask = sheet.endswith("team")
            for o in parts:
                o.visible_camera = (o.name in on_turret) == want_turret
                # mask pass: everything else still occludes (holdout) so hidden bands stay hidden
                o.is_holdout = mask and o.name not in is_team
            ground.hide_render = want_turret or mask
            rgb, alpha = grab(sc)
            out[sheet][:, k * OUT : (k + 1) * OUT, :3] = rgb
            out[sheet][:, k * OUT : (k + 1) * OUT, 3] = alpha
        print(f"[{NAME}] direction {k + 1}/{DIRS}")
    for sheet, arr in out.items():
        img = bpy.data.images.new(f"tank-{NAME}-{sheet}", OUT * DIRS, OUT, alpha=True)
        img.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        img.filepath_raw = os.path.join(SPRITES, f"tank-{NAME}-{sheet}.png")
        img.file_format = "PNG"
        img.save()
        print(f"[{NAME}] wrote tank-{NAME}-{sheet}.png")
    os.remove(TMP)


main()

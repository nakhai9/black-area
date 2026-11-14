"""
LDEW: high-energy laser directed-energy weapon (counter-UAS), built from scratch in Blender after the DragonFire
reference drawings and photos: a long horizontal drum on a turntable yoke, the large beam-director tube angled up out
of the front-left, a round tracking-sensor port on the right cheek, a boxed sensor window at the rear end, a ribbed
cooling grille under the drum, and a round pedestal on a bolted flange. Military white.

Real size, metres: head 2.9 long (u), 1.5 wide (v); 2.3 high (z) on the ground pedestal. Ground scale = M_TO_GRID
(grid px per metre on the 64 px 1x1 tile grid, shared with the game tanks); one cell = one 1x1 tile. The game scales
it up in code later.

Two variants (LDEW_VARIANT):
    ground  tall pedestal + bolted flange: a stand-alone emplacement on one 1x1 tile
    truck   low slew ring + mount plate, to sit on the cargo bed of the European truck (new combat vehicle);
            the ground point of the cell is the mount plate bottom, so the game draws it at the truck bed point.

The pedestal (base) is fixed; the head turns all round to fire (32 facings, clockwise from North, like tank turrets).
Faction colour: every TEAM-material part (pedestal / ring band, drum side stripes, rear panel) is also rendered alone
into the "-team" mask sheets; the game multiplies the mask by the owner's hex colour and draws it on top.
LDEW_TEAM=#rrggbb bakes one colour into the main sheets instead of neutral grey.

Sheets in ui/public/sprites (32 cells in one row, OUT px per cell, ground point under the slew ring at PIVOT):
    ldew-<variant>-base.png  ldew-<variant>-head.png  ldew-<variant>-base-team.png  ldew-<variant>-head-team.png

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/ldew_sheet.py

Env: LDEW_VARIANT=ground|truck, LDEW_SAMPLES=<n> (32), LDEW_TEAM, LDEW_PREVIEW=<file.png> (LDEW_DIR=<0..31>).
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
VARIANT = os.environ.get("LDEW_VARIANT", "ground")
NAME = f"ldew-{VARIANT}"
TMP = os.path.join(HERE, f"_ldew_{VARIANT}_tmp.png")
SPP = int(os.environ.get("LDEW_SAMPLES", "32"))
PREVIEW = os.environ.get("LDEW_PREVIEW")
TEAM_HEX = os.environ.get("LDEW_TEAM", "#c8c8c8")  # neutral grey: the mask carries the faction colour

GRID, DIRS = 64, 32  # one cell = one 1x1 tile
OUT, SSAA = 256, 2
PIVOT = (32, 40)
ELEV = math.radians(30)
M_TO_GRID = 42 / 7.77  # grid px per metre, shared ground scale of the game tanks
TALL = 1.0
RING_Z = 1.15 if VARIANT == "ground" else 0.22  # top of the fixed part = head origin
# Beam director tilt: up 35 deg on the ground mount; level on the truck, the lens glass facing straight ahead.
BD_TILT = 35 if VARIANT == "ground" else 0

WHITE = "#e4e6e3"
WHITE_SHADE = "#cfd2ce"


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
    """Military paint with light grime (4 % noise), never blotchy."""
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




# ------------------------------------------------------------------ LDEW


def model():
    white = moss("white", WHITE)
    shade = moss("white_shade", WHITE_SHADE)
    team = paint("TEAM", TEAM_HEX, rough=0.5)
    black = paint("black", "#141618", rough=0.45, metal=0.3)
    lens = paint("lens", "#0d1a24", rough=0.06, metal=0.6)
    steel = paint("steel", "#8d9290", rough=0.38, metal=0.8)

    root = pivot("LDEW", (0, 0, 0), None)

    # ---- fixed part: flange + pedestal (ground) or a low slew ring on a mount plate (truck)
    if VARIANT == "ground":
        rod("flange", (0, 0, 0.04), 0.82, 0.08, "Z", shade, root, sides=40)
        for k in range(16):
            a = k / 16 * 2 * math.pi
            rod(f"bolt{k}", (0.74 * math.cos(a), 0.74 * math.sin(a), 0.1), 0.025, 0.04, "Z", steel, root, sides=8)
        rod("plinth", (0, 0, 0.3), 0.62, 0.44, "Z", white, root, sides=40)
        rod("plinth_lip", (0, 0, 0.53), 0.66, 0.05, "Z", shade, root, sides=40)
        rod("column", (0, 0, 0.82), 0.48, 0.55, "Z", white, root, sides=40)
        rod("team_band_ped", (0, 0, 0.32), 0.625, 0.14, "Z", team, root, sides=40)
        block("access_panel", (0.47, 0, 0.82), (0.04, 0.36, 0.32), shade, root, 0.004)
        for k in range(10):
            a = k / 10 * 2 * math.pi
            block(f"rib{k}", (0.49 * math.cos(a), 0.49 * math.sin(a), 0.82), (0.05, 0.05, 0.5), shade, root, 0)
    else:
        rod("mount_plate", (0, 0, 0.06), 0.7, 0.12, "Z", shade, root, sides=40)
        rod("team_band_ring", (0, 0, 0.14), 0.58, 0.06, "Z", team, root, sides=40)
    rod("slew_ring", (0, 0, RING_Z - 0.05), 0.52, 0.1, "Z", steel, root, sides=40)

    # ---- head: turntable, yoke, long drum
    head = pivot("Head", (0, 0, RING_Z), root)
    rod("turntable", (0, 0, 0.08), 0.5, 0.16, "Z", white, head, sides=40)
    for k in range(20):
        a = k / 20 * 2 * math.pi
        block(f"tt_tooth{k}", (0.5 * math.cos(a), 0.5 * math.sin(a), 0.03), (0.04, 0.04, 0.06), steel, head, 0)
    for s in (-1, 1):
        shell(f"yoke{s}", [(x, s * y, z) for y in (0.42, 0.55) for x, z in ((-0.45, 0.16), (0.45, 0.16), (0.3, 0.75), (-0.3, 0.75))], white, head, 0.02)
    drum = pivot("Drum", (0.0, 0, 0.82), head)
    rod("drum", (0, 0, 0), 0.5, 2.1, "X", white, drum, sides=40)
    for x in (-0.78, 0.55):
        rod(f"drum_hoop{x}", (x, 0, 0), 0.52, 0.06, "X", shade, drum, sides=40)
    # ribbed cooling grille under the drum (the boxed cells)
    block("grille_frame", (-0.1, 0, -0.42), (1.3, 0.9, 0.3), shade, drum, 0.01)
    for i in range(4):
        for j in range(2):
            block(f"grille_cell{i}{j}", (-0.55 + i * 0.3, (j - 0.5) * 0.46, -0.58), (0.24, 0.36, 0.04), black, drum, 0.004)
    # beam director: big tube angled up out of the front-left end, dark lens in a rim
    bd = pivot("BeamDirector", (1.05, 0.12, 0.05), drum)
    bd.rotation_euler = (0, math.radians(-BD_TILT), 0)
    rod("bd_tube", (0.35, 0, 0), 0.4, 0.9, "X", white, bd, sides=40)
    rod("bd_rim", (0.81, 0, 0), 0.42, 0.04, "X", shade, bd, sides=40)
    rod("bd_lens", (0.8, 0, 0), 0.34, 0.04, "X", lens, bd, sides=40)
    block("bd_saddle", (1.0, 0.12, -0.25), (0.6, 0.7, 0.4), white, drum, 0.03)
    # right cheek: round tracking-sensor port with bolted ring
    rod("sensor_boss", (0.7, -0.52, 0), 0.26, 0.12, "Y", shade, drum, sides=32)
    rod("sensor_lens", (0.7, -0.585, 0), 0.19, 0.02, "Y", lens, drum, sides=32)
    for k in range(8):
        a = k / 8 * 2 * math.pi
        rod(f"sensor_bolt{k}", (0.7 + 0.23 * math.cos(a), -0.59, 0.23 * math.sin(a)), 0.015, 0.02, "Y", steel, drum, sides=6)
    # rear end: tall box with the sensor window, side vents
    block("rear_box", (-1.2, 0, 0.05), (0.36, 1.1, 1.15), white, drum, 0.03)
    block("rear_window", (-1.0, 0, 0.35), (0.04, 0.5, 0.22), lens, drum, 0)
    block("rear_window_hood", (-0.98, 0, 0.5), (0.1, 0.6, 0.05), shade, drum, 0)
    for s in (-1, 1):
        for k in range(3):
            block(f"vent{s}{k}", (-1.2, s * 0.56, -0.15 - k * 0.15), (0.24, 0.02, 0.06), black, drum, 0)
        block(f"team_stripe{s}", (-0.15, s * 0.505, 0.3), (1.1, 0.02, 0.1), team, drum, 0)
    block("team_rear", (-1.385, 0, -0.2), (0.02, 0.8, 0.14), team, drum, 0)
    return root, head


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
    root, head = model()
    stand = pivot("Stand", (0, 0, 0), None)
    root.parent = stand
    stand.scale = (1, 1, TALL)

    if PREVIEW:
        stand.rotation_euler = (0, 0, yaw_for(int(os.environ.get("LDEW_DIR", "4"))))
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        return

    on_head = {o.name for o in [head] + list(head.children_recursive)}
    parts = [o for o in sc.objects if o.type == "MESH" and o is not ground]
    is_team = {o.name for o in parts if o.active_material and o.active_material.name == "TEAM"}
    sheets = ("base", "head", "base-team", "head-team")
    out = {p: np.zeros((OUT, OUT * DIRS, 4), np.float32) for p in sheets}
    for k in range(DIRS):
        stand.rotation_euler = (0, 0, yaw_for(k))
        for sheet in sheets:
            want_head = sheet.startswith("head")
            mask = sheet.endswith("team")
            for o in parts:
                o.visible_camera = (o.name in on_head) == want_head
                o.is_holdout = mask and o.name not in is_team
            ground.hide_render = want_head or mask
            rgb, alpha = grab(sc)
            out[sheet][:, k * OUT : (k + 1) * OUT, :3] = rgb
            out[sheet][:, k * OUT : (k + 1) * OUT, 3] = alpha
        print(f"[{NAME}] direction {k + 1}/{DIRS}")
    for sheet, arr in out.items():
        img = bpy.data.images.new(f"{NAME}-{sheet}", OUT * DIRS, OUT, alpha=True)
        img.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        img.filepath_raw = os.path.join(SPRITES, f"{NAME}-{sheet}.png")
        img.file_format = "PNG"
        img.save()
        print(f"[{NAME}] wrote {NAME}-{sheet}.png")
    os.remove(TMP)


main()

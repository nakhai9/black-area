"""
R-12 Dvina launcher (SM-63 type rail launcher with its V-750 class two-stage missile), built from scratch in Blender
after the reference photos and the side-view drawing: a cruciform ground stand (four box outriggers with screw-jack
pads round a ring plinth), a turntable deck carrying two equipment cabinets with sloped tops, one long box rail beam on
a rear trunnion raised by a ram, a blast deflector scoop on its own tripod and round foot behind, and the missile on top
of the rail: booster (thick, four big cropped-delta fins), sustainer (slim, four mid wings), small canards and a pointed
nose with a pitot probe. Dark moss-green paint, light grey missile.

Real size, metres: missile 10.6 long, booster 0.65 / sustainer 0.5 across, fin span 2.2; rail 7.6 long; stand 6.8 tip
to tip; launcher on the stand ~ 9.6 long (u, with the deflector), 3.0 wide (v, cabinets), missile tip 8.9 high (z) at
the 40 deg launch elevation. Ground scale = M_TO_GRID (grid px per metre, shared with the game tanks).

Three separately drawn parts, so each can be reused on its own (the missile on a flying round or another launcher):
    base      fixed ground stand (outriggers, pads, plinth) - with the ground shadow of the stand and the launcher
    launcher  turntable, cabinets (the faction band wraps both of them), rail, ram, deflector - turns with its aim
    missile   the missile alone on the rail - hidden in the game while the rail reloads
The stand keeps one yaw (outriggers along the world grid axes); launcher and missile turn together, 32 facings,
clockwise from screen North (cell k of every sheet matches, the base cell k carries that facing's shadow).
Faction colour: the TEAM band is also rendered alone into "dvina-launcher-team"; the game multiplies it by the owner's
hex colour and draws it on top. DVINA_TEAM=#rrggbb bakes one colour in instead of neutral grey.

Sheets in ui/public/sprites (32 cells in one row, OUT px per cell, ground point under the turntable at PIVOT):
    dvina-base.png  dvina-launcher.png  dvina-launcher-team.png  dvina-missile.png

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/dvina_sheet.py

Env: DVINA_SHEETS=base,launcher,... (all), DVINA_SAMPLES=<n> (32), DVINA_TEAM, DVINA_PREVIEW=<file.png> (DVINA_DIR=<0..31>).
Axes: +X front (u, where the missile points), +Y left (v), +Z up (z), metres.
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
NAME = "dvina"
ALL_SHEETS = ("base", "launcher", "launcher-team", "missile")
SHEETS = tuple(s for s in os.environ.get("DVINA_SHEETS", ",".join(ALL_SHEETS)).split(",") if s)
TMP = os.path.join(HERE, f"_dvina_{'_'.join(SHEETS)}_tmp.png")
SPP = int(os.environ.get("DVINA_SAMPLES", "32"))
PREVIEW = os.environ.get("DVINA_PREVIEW")
TEAM_HEX = os.environ.get("DVINA_TEAM", "#c8c8c8")

GRID, DIRS = 128, 32
OUT, SSAA = 384, 2
PIVOT = (64, 84)
ELEV = math.radians(30)
M_TO_GRID = 42 / 7.77
LAUNCH = math.radians(40)  # rail elevation
STAND_YAW = math.radians(45)  # outriggers along the world grid axes

MOSS = "#3f4a2a"  # dark moss green
MOSS_SHADE = "#343e23"
MISSILE = "#b4b8b9"
MISSILE_SHADE = "#9a9ea0"


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


def grimy(name, hexc, rough=0.7, metal=0.0):
    """Paint with light grime (4 % noise), never blotchy."""
    m = paint(name, hexc, rough, metal)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    p = nodes["Principled BSDF"]
    coords = nodes.new("ShaderNodeTexCoord")
    tex = nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 2.5
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


def block(name, centre, size, mat, parent, round_edges=0.015):
    cx, cy, cz = centre
    sx, sy, sz = (v / 2 for v in size)
    return shell(name, [(cx + a * sx, cy + b * sy, cz + c * sz) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)], mat, parent, round_edges)


def rod(name, centre, radius, length, axis, mat, parent, sides=24, radius2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=radius, radius2=radius if radius2 is None else radius2, depth=length)
    ob = to_object(name, bm, mat, parent, smooth=True)
    ob.location = centre
    # +depth along: X -> +X, Y -> +Y, Z -> +Z (radius2 is the + end)
    ob.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (-math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    return ob


def pivot(name, loc, parent, rot=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def fin(name, x_root, r, root_len, tip_len, sweep, span, angle, mat, parent, thick=0.035):
    """Flat cropped-delta fin on a body of radius r at roll `angle`: root chord from x_root forward, tip set back by sweep."""
    ca, sa = math.cos(angle), math.sin(angle)
    pts = []
    for x, d in ((x_root, r * 0.9), (x_root + root_len, r * 0.9), (x_root + sweep + tip_len, r + span), (x_root + sweep, r + span)):
        for t in (-thick / 2, thick / 2):
            pts.append((x, d * ca - t * sa, d * sa + t * ca))
    return shell(name, pts, mat, parent, 0.006)


# ------------------------------------------------------------------ studio


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
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    ground = to_object("Ground", bm, paint("ground", "#ffffff"), None)
    ground.is_shadow_catcher = True
    cam_data = bpy.data.cameras.new("view")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = GRID / M_TO_GRID
    cam_data.clip_end = 400
    cam = bpy.data.objects.new("view", cam_data)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.pi / 2 - ELEV, 0, 0)
    q = cam.rotation_euler.to_quaternion()
    cam.location = (q @ Vector((0, 1, 0))) * ((PIVOT[1] - GRID / 2) / M_TO_GRID) + (q @ Vector((0, 0, 1))) * 80
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


# ------------------------------------------------------------------ R-12 Dvina


def stand_model(moss, shade, steel, dark):
    """Fixed cruciform ground stand."""
    stand = pivot("Stand", (0, 0, 0), None, (0, 0, STAND_YAW))
    rod("plinth", (0, 0, 0.32), 1.05, 0.64, "Z", moss, stand, sides=40)
    rod("plinth_lip", (0, 0, 0.66), 1.12, 0.06, "Z", shade, stand, sides=40)
    for k in range(4):
        a = k * math.pi / 2
        ca, sa = math.cos(a), math.sin(a)
        arm = pivot(f"arm{k}", (0, 0, 0), stand, (0, 0, a))
        # tapering box outrigger, deep at the plinth, shallow at the jack
        shell(f"outrigger{k}", [(x, y, z) for x, hy, hz in ((0.9, 0.24, 0.5), (3.2, 0.17, 0.26)) for y in (-hy, hy) for z in (0.06, hz)], moss, arm, 0.02)
        block(f"outrigger_top{k}", (2.05, 0, 0.44), (2.2, 0.36, 0.03), shade, arm, 0.004)
        for x in (1.4, 2.0, 2.6):
            block(f"web{k}{x}", (x, 0, 0.26), (0.04, 0.38, 0.32), shade, arm, 0.003)
        # screw jack and its round pad at the tip
        rod(f"jack{k}", (3.25, 0, 0.32), 0.07, 0.5, "Z", steel, arm, sides=12)
        rod(f"jack_head{k}", (3.25, 0, 0.6), 0.11, 0.1, "Z", dark, arm, sides=12)
        rod(f"pad{k}", (3.25, 0, 0.04), 0.32, 0.08, "Z", shade, arm, sides=28)
        block(f"lug{k}", (1.05, 0, 0.58), (0.22, 0.5, 0.12), shade, arm, 0.01)
        _ = (ca, sa)
    return stand


def launcher_model(moss, shade, steel, dark, team, glass):
    """Turning part: deck, cabinets, rail, ram, deflector. Returns (root, rail pivot)."""
    top = pivot("Launcher", (0, 0, 0.69), None)
    rod("turntable", (0, 0, 0.06), 1.0, 0.12, "Z", steel, top, sides=40)
    block("deck", (-0.3, 0, 0.2), (3.8, 2.4, 0.16), moss, top, 0.02)
    # two equipment cabinets either side of the rail, sloped tops and a gap for the rail between them
    for s in (-1, 1):
        y0, y1 = s * 0.42, s * 1.5
        pts = []
        for y in (y0, y1):
            pts += [(-1.9, y, 0.28), (1.2, y, 0.28), (1.2, y, 1.15), (0.6, y, 1.55), (-1.9, y, 1.55)]
        shell(f"cabinet{s}", pts, moss, top, 0.03)
        # panel doors and hinges on the outer face
        for i, x in enumerate((-1.45, -0.6, 0.25)):
            block(f"door{s}{i}", (x, y1 + s * 0.012, 0.9), (0.72, 0.02, 0.9), shade, top, 0.004)
            block(f"handle{s}{i}", (x + 0.25, y1 + s * 0.03, 0.9), (0.04, 0.03, 0.14), steel, top, 0)
        block(f"vent{s}", (0.85, y1 + s * 0.012, 0.75), (0.4, 0.02, 0.28), dark, top, 0)
        # faction band wrapped round the cabinet
        band_pts = []
        for y in (y0 - s * 0.012, y1 + s * 0.016):
            band_pts += [(-1.916, y, 0.48), (1.216, y, 0.48), (1.216, y, 0.62), (-1.916, y, 0.62)]
        shell(f"team_band{s}", band_pts, team, top, 0)
        block(f"cab_roof_rail{s}", (-0.65, (y0 + y1) / 2, 1.57), (2.4, 0.9, 0.03), shade, top, 0.004)
        block(f"gauge{s}", (-1.92, s * 0.95, 1.1), (0.02, 0.3, 0.2), glass, top, 0)
    # trunnion posts at the rear and the rail on them
    for s in (-1, 1):
        shell(f"trunnion{s}", [(x, s * y, z) for y in (0.26, 0.38) for x, z in ((-2.0, 0.28), (-1.2, 0.28), (-1.55, 1.25), (-1.75, 1.25))], moss, top, 0.015)
    rod("trunnion_pin", (-1.65, 0, 1.15), 0.09, 0.9, "Y", steel, top, sides=16)
    rail = pivot("Rail", (-1.65, 0, 1.15), top, (0, -LAUNCH, 0))
    shell("rail_beam", [(x, y, z) for x, hy, z0, z1 in ((-0.4, 0.26, -0.3, 0.12), (7.2, 0.18, -0.12, 0.12)) for y in (-hy, hy) for z in (z0, z1)], moss, rail, 0.02)
    block("rail_track", (3.4, 0, 0.15), (7.6, 0.16, 0.06), steel, rail, 0.004)
    for x in (0.4, 1.6, 2.8, 4.0, 5.2, 6.4):
        block(f"rail_rib{x}", (x, 0, -0.04), (0.05, 0.56, 0.26), shade, rail, 0.003)
    block("rail_head", (7.1, 0, 0.04), (0.25, 0.42, 0.3), shade, rail, 0.01)
    block("shoe_rear", (0.3, 0, 0.27), (0.4, 0.2, 0.18), dark, rail, 0.005)
    block("shoe_front", (4.2, 0, 0.27), (0.3, 0.2, 0.14), dark, rail, 0.005)
    block("umbilical", (1.2, -0.28, 0.12), (0.5, 0.1, 0.24), shade, rail, 0.008)
    # elevating ram: cylinder from the deck to the rail's underside
    foot = Vector((0.35, 0, 0.35))
    on_rail = Vector((-1.65, 0, 1.15)) + Vector((2.4 * math.cos(LAUNCH) + 0.3 * math.sin(LAUNCH), 0, 2.4 * math.sin(LAUNCH) - 0.3 * math.cos(LAUNCH)))
    d = on_rail - foot
    ram = pivot("Ram", foot, top, (0, math.atan2(d.x, d.z), 0))
    rod("ram_cyl", (0, 0, d.length * 0.3), 0.14, d.length * 0.6, "Z", shade, ram, sides=16)
    rod("ram_rod", (0, 0, d.length * 0.75), 0.07, d.length * 0.5, "Z", steel, ram, sides=12)
    # blast deflector: curved scoop on a tripod behind the launcher, round foot on the ground
    defl = pivot("Deflector", (-4.0, 0, -0.69), top)
    rod("defl_foot", (0, 0, 0.05), 0.55, 0.1, "Z", moss, defl, sides=32)
    rod("defl_post", (0, 0, 0.55), 0.08, 0.95, "Z", shade, defl, sides=12)
    for s in (-1, 1):
        shell(f"defl_strut{s}", [(x, s * y, z) for x, y, z in ((0.0, 0.0, 0.1), (0.05, 0.05, 0.1), (0.55, 0.55, 1.1), (0.6, 0.6, 1.1))], shade, defl, 0.01)
    arc = 9
    for i in range(arc):
        t0, t1 = i / arc, (i + 1) / arc
        a0, a1 = math.radians(-20 + 85 * t0), math.radians(-20 + 85 * t1)
        pts = []
        for a in (a0, a1):
            for w in (-0.8 - 0.25 * t0, 0.8 + 0.25 * t0):
                for r in (1.1, 1.14):
                    pts.append((0.6 - r * math.cos(a), w, 0.9 + r * math.sin(a) + 0.15))
        shell(f"defl_plate{i}", pts, moss, defl, 0.004)
    block("defl_link", (1.2, 0, 0.95), (2.6, 0.12, 0.1), shade, defl, 0.01)
    return top, rail


def missile_model(rail, grey, grey_shade, dark, steel):
    """V-750 class missile on the rail (its own objects, under the "Missile" empty)."""
    m = pivot("Missile", (0.0, 0, 0.62), rail)
    # booster (stage 1): thick can, four big cropped-delta fins, nozzle
    rod("booster", (0.0, 0, 0), 0.325, 2.7, "X", grey, m, sides=32)
    rod("nozzle", (-1.42, 0, 0), 0.26, 0.18, "X", dark, m, sides=24, radius2=0.2)
    rod("booster_ring", (0.8, 0, 0), 0.335, 0.06, "X", grey_shade, m, sides=32)
    rod("interstage", (1.55, 0, 0), 0.325, 0.4, "X", grey_shade, m, sides=32, radius2=0.25)
    for k in range(4):
        fin(f"b_fin{k}", -1.3, 0.325, 1.5, 0.55, 1.0, 0.95, math.pi / 4 + k * math.pi / 2, grey, m, 0.04)
    # sustainer (stage 2): slim body, mid wings, small canards, ogive nose and pitot
    rod("sustainer", (4.2, 0, 0), 0.25, 5.0, "X", grey, m, sides=32)
    for x in (2.4, 3.6, 5.0, 6.2):
        rod(f"joint{x}", (x, 0, 0), 0.255, 0.035, "X", grey_shade, m, sides=32)
    for k in range(4):
        fin(f"wing{k}", 2.6, 0.25, 1.3, 0.35, 0.95, 0.62, math.pi / 4 + k * math.pi / 2, grey, m, 0.035)
        fin(f"canard{k}", 6.55, 0.25, 0.42, 0.12, 0.3, 0.26, math.pi / 4 + k * math.pi / 2, grey, m, 0.025)
        fin(f"aileron{k}", 3.0, 0.25, 0.3, 0.3, 0.0, 0.1, k * math.pi / 2, grey_shade, m, 0.03)
    rod("nose", (7.85, 0, 0), 0.25, 2.3, "X", grey, m, sides=32, radius2=0.03)
    rod("pitot", (9.25, 0, 0), 0.012, 0.6, "X", steel, m, sides=8)
    rod("conduit", (4.0, 0, 0.26), 0.035, 4.6, "X", grey_shade, m, sides=8)
    return m


def build():
    moss = grimy("moss", MOSS, 0.72)
    shade = grimy("moss_shade", MOSS_SHADE, 0.74)
    team = paint("TEAM", TEAM_HEX, rough=0.5)
    steel = paint("steel", "#7c8078", rough=0.4, metal=0.8)
    dark = paint("dark", "#1b1d1a", rough=0.5, metal=0.2)
    glass = paint("glass", "#14202a", rough=0.08, metal=0.5)
    grey = grimy("missile", MISSILE, 0.42, 0.25)
    grey_shade = grimy("missile_shade", MISSILE_SHADE, 0.45, 0.3)
    stand = stand_model(moss, shade, steel, dark)
    top, rail = launcher_model(moss, shade, steel, dark, team, glass)
    missile = missile_model(rail, grey, grey_shade, dark, steel)
    return stand, top, missile


def main():
    sc, ground = studio(512 if PREVIEW else OUT * SSAA)
    stand, top, missile = build()

    if PREVIEW:
        top.rotation_euler = (0, 0, yaw_for(int(os.environ.get("DVINA_DIR", "4"))))
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        return

    on_stand = {o.name for o in [stand] + list(stand.children_recursive)}
    on_missile = {o.name for o in [missile] + list(missile.children_recursive)}
    parts = [o for o in sc.objects if o.type == "MESH" and o is not ground]
    is_team = {o.name for o in parts if o.active_material and o.active_material.name == "TEAM"}

    def part_of(o):
        return "base" if o.name in on_stand else "missile" if o.name in on_missile else "launcher"

    out = {p: np.zeros((OUT, OUT * DIRS, 4), np.float32) for p in SHEETS}
    for k in range(DIRS):
        top.rotation_euler = (0, 0, yaw_for(k))
        for sheet in SHEETS:
            want = sheet.split("-")[0]
            mask = sheet.endswith("team")
            for o in parts:
                o.visible_camera = part_of(o) == want
                o.is_holdout = mask and o.name not in is_team
                # The stand's ground shadow leaves the missile out: it is gone while the rail reloads.
                o.visible_shadow = part_of(o) != "missile" or want == "missile"
            ground.hide_render = want != "base"
            rgb, alpha = grab(sc)
            out[sheet][:, k * OUT : (k + 1) * OUT, :3] = rgb
            out[sheet][:, k * OUT : (k + 1) * OUT, 3] = alpha
        print(f"[{NAME}] direction {k + 1}/{DIRS}", flush=True)
    for sheet, arr in out.items():
        img = bpy.data.images.new(f"{NAME}-{sheet}", OUT * DIRS, OUT, alpha=True)
        img.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        img.filepath_raw = os.path.join(SPRITES, f"{NAME}-{sheet}.png")
        img.file_format = "PNG"
        img.save()
        print(f"[{NAME}] wrote {NAME}-{sheet}.png")
    os.remove(TMP)


main()

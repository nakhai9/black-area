"""
2K12 Kub (SA-6) launcher as a Defense-tab emplacement, built from scratch in Blender after the 2P25 reference photos
and the SA-6 Gainful drawing: the GM-578 tracked hull (six road wheels a side, sprocket front, idler rear, sloped
glacis, side panels, unditching log, lights, hatches, engine grille) standing dug in on its own ground pad, a
turntable on the deck with an elevating cradle, three launch rails (centre one raised) under the tubular guard
hoops, and three 3M9 missiles: cylindrical body, four cropped-delta mid wings and four tail fins, light nose cone.
Dark moss-green paint.

Real size, metres: hull 7.4 long (u), 3.18 wide (v); 3.6 high (z) with the rack at 30 deg; missile 5.8 long, 0.335
across. Ground scale = M_TO_GRID (grid px per metre, shared with the game tanks).

Three separately drawn parts:
    base      hull + ground pad (fixed; faction band wrapped round the hull) - with the ground shadow
    launcher  turntable, cradle, rails, guard frame - turns with its aim
    missile   the three missiles alone - hidden in the game while they reload
The hull keeps one yaw (along the world grid axis); launcher and missiles turn together, 32 facings, clockwise from
screen North. Faction colour: TEAM band rendered alone into "kub-base-team"; the game tints it with the owner's colour.

Sheets in ui/public/sprites: kub-base.png kub-base-team.png kub-launcher.png kub-missile.png

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/kub_sheet.py

Env: KUB_SHEETS=base,... (all), KUB_SAMPLES=<n> (32), KUB_TEAM, KUB_PREVIEW=<file.png> (KUB_DIR=<0..31>).
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
NAME = "kub"
ALL_SHEETS = ("base", "base-team", "launcher", "missile")
SHEETS = tuple(s for s in os.environ.get("KUB_SHEETS", ",".join(ALL_SHEETS)).split(",") if s)
TMP = os.path.join(HERE, f"_kub_{'_'.join(SHEETS)}_tmp.png")
SPP = int(os.environ.get("KUB_SAMPLES", "32"))
PREVIEW = os.environ.get("KUB_PREVIEW")
TEAM_HEX = os.environ.get("KUB_TEAM", "#c8c8c8")

GRID, DIRS = 128, 32
OUT, SSAA = 384, 2
PIVOT = (64, 84)
ELEV = math.radians(30)
M_TO_GRID = 42 / 7.77
LAUNCH = math.radians(30)  # rack elevation
RAILS = ((0.0, 0.62), (0.95, 0.42), (-0.95, 0.42))  # (v, height over the rack) of the three rails
STAND_YAW = math.radians(45)  # hull along a world grid axis

MOSS = "#3f4a2a"  # dark moss green
MOSS_SHADE = "#343e23"
MISSILE = "#4a5531"
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


# ------------------------------------------------------------------ 2K12 Kub


def wheel(name, x, y, r, mat, hub, parent):
    rod(name, (x, y, r), r, 0.32, "Y", mat, parent, sides=28)
    rod(name + "_hub", (x, y + (0.17 if y > 0 else -0.17), r), r * 0.42, 0.04, "Y", hub, parent, sides=16)


def stand_model(moss, shade, steel, dark, team, glass, rubber, concrete):
    """Fixed part: GM-578 tracked hull dug in on its own ground pad, faction band wrapped round the hull."""
    stand = pivot("Stand", (0, 0, 0), None, (0, 0, STAND_YAW))
    # ground pad the tracks stand on (keeps it fixed to the ground)
    block("pad", (0, 0, 0.06), (8.2, 3.9, 0.12), concrete, stand, 0.03)
    for s in (-1, 1):
        y = s * 1.3
        # track run: ground run, return run, sprocket and idler
        shell(f"track{s}", [(x, y + d, z) for x, z in ((-3.25, 0.12), (3.15, 0.12), (3.55, 0.62), (3.3, 0.95), (-3.45, 0.95), (-3.7, 0.55)) for d in (-0.27, 0.27)], rubber, stand, 0.02)
        for i in range(6):
            wheel(f"road{s}{i}", -2.55 + i * 1.02, y + s * 0.02, 0.36, moss, steel, stand)
        wheel(f"sprocket{s}", 3.2, y + s * 0.02, 0.3, shade, steel, stand)
        wheel(f"idler{s}", -3.35, y + s * 0.02, 0.28, shade, steel, stand)
        for i in range(36):
            block(f"link{s}{i}", (-3.2 + i * 0.18, y + s * 0.0, 0.135), (0.08, 0.56, 0.035), dark, stand, 0)
        # side skirt / fender over the tracks with stowage boxes
        block(f"fender{s}", (0.0, s * 1.36, 1.02), (7.2, 0.6, 0.05), shade, stand, 0.006)
    # hull body: sloped glacis at the front, flat deck, square rear
    hull_pts = [(x, y, z) for y in (-1.38, 1.38) for x, z in ((-3.6, 0.55), (-3.65, 1.75), (2.7, 1.75), (3.7, 1.15), (3.7, 0.55))]
    shell("hull", hull_pts, moss, stand, 0.03)
    # faction band wrapped round the hull just under the deck edge
    band = [(x, y, z) for y in (-1.395, 1.395) for x, z in ((-3.665, 1.42), (-3.665, 1.56), (3.06, 1.42), (3.06, 1.52))]
    band_front = [(x, y, z) for y in (-1.395, 1.395) for x, z in ((2.93, 1.56), (3.06, 1.56))]
    shell("team_band", band, team, stand, 0)
    _ = band_front
    # side armour panels, hatches, engine grilles, lights, tow hooks, unditching log
    for s in (-1, 1):
        for i, x in enumerate((-2.6, -1.2, 0.2, 1.6)):
            block(f"panel{s}{i}", (x, s * 1.392, 1.05), (1.2, 0.02, 0.55), shade, stand, 0.004)
        block(f"headlight{s}", (3.72, s * 1.05, 1.25), (0.06, 0.22, 0.16), glass, stand, 0.01)
        block(f"towhook{s}", (3.75, s * 0.7, 0.75), (0.1, 0.12, 0.12), steel, stand, 0.01)
    block("glacis_plate_l", (3.2, 0.45, 1.46), (0.9, 0.8, 0.03), shade, stand, 0.004)
    block("glacis_plate_r", (3.2, -0.45, 1.46), (0.9, 0.8, 0.03), shade, stand, 0.004)
    for i in range(5):
        block(f"grille{i}", (-2.9 + i * 0.22, 0, 1.77), (0.12, 1.6, 0.02), dark, stand, 0)
    rod("log", (-3.78, 0, 1.45), 0.13, 2.6, "Y", rubber, stand, sides=14)
    rod("hatch_f", (2.2, 0.6, 1.78), 0.32, 0.06, "Z", shade, stand, sides=20)
    rod("periscope_cupola", (2.0, -0.7, 1.82), 0.2, 0.14, "Z", shade, stand, sides=16)
    block("exhaust", (-3.0, -1.1, 1.82), (0.4, 0.3, 0.12), dark, stand, 0.01)
    # fixed turntable ring on the deck
    rod("ring_base", (-0.4, 0, 1.82), 0.95, 0.14, "Z", shade, stand, sides=40)
    return stand


def launcher_model(moss, shade, steel, dark, team, glass):
    """Turning part: turntable, elevating cradle with three launch rails, the tubular guard frame."""
    top = pivot("Launcher", (-0.4, 0, 1.89), None)
    rod("turntable", (0, 0, 0.12), 0.9, 0.24, "Z", moss, top, sides=40)
    block("cradle_base", (0, 0, 0.45), (1.4, 1.2, 0.42), moss, top, 0.03)
    for s in (-1, 1):
        shell(f"trunnion{s}", [(x, s * y, z) for y in (0.35, 0.5) for x, z in ((-0.6, 0.6), (0.4, 0.6), (-0.15, 1.15), (-0.45, 1.15))], moss, top, 0.015)
    rod("trunnion_pin", (-0.3, 0, 1.05), 0.08, 1.2, "Y", steel, top, sides=14)
    rack = pivot("Rack", (-0.3, 0, 1.05), top, (0, -LAUNCH, 0))
    # cross beam carrying three rails (centre one higher)
    block("crossbeam", (0.6, 0, 0.15), (0.5, 2.4, 0.3), moss, rack, 0.02)
    block("crossbeam2", (2.6, 0, 0.15), (0.35, 2.4, 0.22), shade, rack, 0.02)
    for i, (y, z) in enumerate(RAILS):
        block(f"rail{i}", (1.8, y, z), (4.0, 0.16, 0.14), moss, rack, 0.01)
        block(f"rail_track{i}", (1.8, y, z + 0.09), (4.0, 0.08, 0.04), steel, rack, 0.003)
        block(f"rail_post{i}", (0.6, y, (z + 0.15) / 2 + 0.05), (0.3, 0.14, abs(z - 0.15) + 0.2), shade, rack, 0.01)
        block(f"blast{i}", (-0.25, y, z - 0.05), (0.3, 0.3, 0.3), dark, rack, 0.02)
    # tubular guard frame (the hoops over the missiles)
    for x in (0.2, 3.6):
        for s in (-1, 1):
            shell(f"hoop_side{x}{s}", [(x + dx, s * 1.25 + dy, z) for dx in (-0.03, 0.03) for dy in (-0.03, 0.03) for z in (0.1, 1.2)], steel, rack, 0.01)
        shell(f"hoop_top{x}", [(x + dx, y, 1.2 + dz) for dx in (-0.03, 0.03) for dz in (-0.03, 0.03) for y in (-1.25, 1.25)], steel, rack, 0.01)
    for s in (-1, 1):
        shell(f"frame_long{s}", [(x, s * 1.25 + dy, 1.2 + dz) for x in (0.2, 3.6) for dy in (-0.03, 0.03) for dz in (-0.03, 0.03)], steel, rack, 0.01)
    # elevating ram
    rod("ram", (0.35, 0, 0.75), 0.09, 0.7, "Z", steel, top, sides=12)
    block("junction_box", (0.55, 0.62, 0.45), (0.4, 0.2, 0.3), shade, top, 0.01)
    return top, rack


def missile_model(rack, body, nose, dark, ring):
    """Three 3M9 missiles on the rails (own objects under the "Missiles" empty)."""
    ms = pivot("Missiles", (0, 0, 0), rack)
    for i, (y, z) in enumerate(RAILS):
        m = pivot(f"Missile{i}", (-0.1, y, z + 0.3), ms)
        rod(f"m_body{i}", (2.4, 0, 0), 0.168, 4.8, "X", body, m, sides=28)
        rod(f"m_nose{i}", (5.4, 0, 0), 0.168, 1.2, "X", nose, m, sides=28, radius2=0.02)
        rod(f"m_nozzle{i}", (-0.05, 0, 0), 0.13, 0.12, "X", dark, m, sides=20)
        for x in (3.7, 4.6):
            rod(f"m_ring{i}{x}", (x, 0, 0), 0.172, 0.06, "X", ring, m, sides=28)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            fin(f"m_wing{i}{k}", 1.7, 0.168, 1.3, 0.35, 0.95, 0.46, a, body, m, 0.03)
            fin(f"m_tail{i}{k}", 0.05, 0.168, 0.55, 0.3, 0.2, 0.3, a, body, m, 0.025)
    return ms


def build():
    moss = grimy("moss", MOSS, 0.72)
    shade = grimy("moss_shade", MOSS_SHADE, 0.74)
    team = paint("TEAM", TEAM_HEX, rough=0.5)
    steel = paint("steel", "#6e7268", rough=0.4, metal=0.8)
    dark = paint("dark", "#1b1d1a", rough=0.5, metal=0.2)
    glass = paint("glass", "#14202a", rough=0.08, metal=0.5)
    rubber = paint("track", "#2a2b27", rough=0.8, metal=0.3)
    concrete = grimy("pad", "#6f6c63", 0.9)
    body = grimy("missile", MISSILE, 0.55)
    nose = grimy("nose", "#d9dcdc", 0.4, 0.2)
    ring = paint("ring", "#c9b14a", rough=0.6)
    stand = stand_model(moss, shade, steel, dark, team, glass, rubber, concrete)
    top, rack = launcher_model(moss, shade, steel, dark, team, glass)
    missiles = missile_model(rack, body, nose, dark, ring)
    return stand, top, missiles


def main():
    sc, ground = studio(512 if PREVIEW else OUT * SSAA)
    stand, top, missile = build()

    if PREVIEW:
        top.rotation_euler = (0, 0, yaw_for(int(os.environ.get("KUB_DIR", "4"))))
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
                # The ground shadow leaves the missiles out: it is gone while the rail reloads.
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

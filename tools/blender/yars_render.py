"""
RS-24 Yars intercontinental ballistic missile - the missile alone (no launcher vehicle), built from scratch in Blender
after the reference drawing (22.6 m long, stage 1 1.8 m across, stages 2/3 1.6 m) and the 1:100 model photos: three
stages in olive-green paint, light grey joint rings, a short conical step from stage 1 to stage 2, an ogive white-grey
nose fairing, and an aft skirt with four short nozzle stubs round a dark centre. The faction identity band (TEAM) is the
interstage band near the top of stage 1 (the light band of the reference drawing).

Real size, metres: length 22.6 (u), width 1.8 (v), height 1.8 (z, lying on the ground).
Ground scale = M_TO_GRID (grid px per metre, shared with the game tanks and the Dvina sheets).

Sheets in ui/public/sprites (32 cells in one row, OUT px per cell, missile centre on the ground at PIVOT; column 0 = nose
pointing up the screen (North), clockwise):
    yars-missile.png        the missile, lying level
    yars-missile-team.png   the TEAM band alone (the game multiplies it by the owner's colour); YARS_TEAM=#rrggbb bakes
                            one colour into the main sheet instead of neutral grey

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/yars_render.py

Env: YARS_SHEETS=missile,missile-team (both), YARS_SAMPLES=<n> (32), YARS_TEAM, YARS_PREVIEW=<file.png> (YARS_DIR=<0..31>).
Axes: +X nose (u), +Y left (v), +Z up (z), metres.
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
CACHE = os.path.join(HERE, "_cache")
os.makedirs(CACHE, exist_ok=True)
NAME = "yars"
ALL_SHEETS = ("missile", "missile-team")
SHEETS = tuple(s for s in os.environ.get("YARS_SHEETS", ",".join(ALL_SHEETS)).split(",") if s)
TMP = os.path.join(HERE, f"_yars_{'_'.join(SHEETS)}_tmp.png")
SPP = int(os.environ.get("YARS_SAMPLES", "32"))
PREVIEW = os.environ.get("YARS_PREVIEW")
TEAM_HEX = os.environ.get("YARS_TEAM", "#c8c8c8")

GRID, DIRS = 160, 32
OUT, SSAA = 480, 2
PIVOT = (80, 80)
ELEV = math.radians(30)
M_TO_GRID = 42 / 7.77

OLIVE = "#4a5a34"
OLIVE_SHADE = "#3f4d2c"
RING = "#a9adad"
NOSE = "#c9cccb"

LENGTH = 22.6
R1, R2 = 0.9, 0.8  # stage 1 / stages 2-3 radius
TAIL = -LENGTH / 2


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
    tex.inputs["Scale"].default_value = 2.0
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


def lathe(name, profile, mat, parent, sides=48, cap=True):
    """Body of revolution round +X from (x, r) profile points (tail to nose); smooth sides, sharp at the steps."""
    bm = bmesh.new()
    rings = []
    for x, r in profile:
        if r <= 1e-4:
            rings.append([bm.verts.new((x, 0, 0))])
            continue
        rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides))) for i in range(sides)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(b) == 1:
            for i in range(sides):
                bm.faces.new((a[i], a[(i + 1) % sides], b[0]))
        elif len(a) == 1:
            for i in range(sides):
                bm.faces.new((a[0], b[(i + 1) % sides], b[i]))
        else:
            for i in range(sides):
                bm.faces.new((a[i], a[(i + 1) % sides], b[(i + 1) % sides], b[i]))
    if cap:
        for ring in (rings[0], rings[-1]):
            if len(ring) > 1:
                bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(38))
    return ob


def band(name, x0, x1, r, mat, parent):
    return lathe(name, [(x0, r), (x1, r)], mat, parent)


def pivot(name, loc, parent):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob


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
    return sc


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


# ------------------------------------------------------------------ RS-24 Yars


def build():
    olive = grimy("olive", OLIVE, 0.66)
    olive_shade = grimy("olive_shade", OLIVE_SHADE, 0.7)
    ring = grimy("ring", RING, 0.4, 0.55)
    nose_mat = grimy("nose", NOSE, 0.5, 0.05)
    dark = paint("dark", "#1a1c1b", rough=0.55, metal=0.3)
    steel = paint("steel", "#8e9292", rough=0.35, metal=0.85)
    team = paint("TEAM", TEAM_HEX, rough=0.5)

    m = pivot("missile", (0, 0, R1), None)  # lying level on the ground
    t = TAIL
    # aft skirt: grey ring, then a recessed dark base plate with four short nozzle stubs (as on the model)
    band("aft_skirt", t + 0.05, t + 0.55, R1 + 0.02, ring, m)
    lathe("base_plate", [(t + 0.05, 0.0), (t + 0.05, R1 * 0.82), (t + 0.06, R1 * 0.82)], dark, m, cap=False)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        c = (R1 * 0.42 * math.cos(a), R1 * 0.42 * math.sin(a))
        noz = lathe(f"nozzle{k}", [(-0.55, 0.0), (-0.55, 0.15), (-0.45, 0.2), (0.0, 0.2), (0.0, 0.0)], ring, m, sides=24, cap=False)
        noz.location = (t + 0.08, c[0], c[1])
        lathe(f"nozzle_throat{k}", [(-0.56, 0.0), (-0.56, 0.11)], dark, m, sides=24, cap=False).location = (t + 0.08, c[0], c[1])
    lathe("plug", [(t - 0.2, 0.0), (t - 0.2, 0.14), (t + 0.06, 0.18)], steel, m, sides=24, cap=False)

    # stage 1: 1.8 m body, panel seam rings, the TEAM band near its top, conical step to 1.6 m
    s1_end = t + 11.0
    band("stage1", t + 0.55, s1_end, R1, olive, m)
    for x in (t + 3.6, t + 7.2):
        band(f"s1_seam{x:.1f}", x, x + 0.06, R1 + 0.006, olive_shade, m)
    band("team_band", s1_end - 1.6, s1_end - 0.8, R1 + 0.012, team, m)
    band("s1_top_ring", s1_end - 0.18, s1_end, R1 + 0.02, ring, m)
    lathe("s1_step", [(s1_end, R1), (s1_end + 0.7, R2)], olive_shade, m, cap=False)

    # stage 2 and stage 3: 1.6 m body with grey joint rings (as on the model)
    x2 = s1_end + 0.7
    s2_end = x2 + 4.4
    s3_end = s2_end + 3.4
    band("stage2", x2, s3_end, R2, olive, m)
    for x in (x2 + 0.2, s2_end - 1.6, s2_end, s3_end - 0.15):
        band(f"ring{x:.1f}", x - 0.12, x + 0.12, R2 + 0.02, ring, m)
    band("s2_seam", x2 + 2.2, x2 + 2.26, R2 + 0.006, olive_shade, m)
    for k in range(2):  # cable conduits along stages 2-3
        a = math.pi / 2 + k * math.pi
        cnd = lathe(f"conduit{k}", [(0, 0.0), (0, 0.05), (s3_end - x2 - 0.6, 0.05), (s3_end - x2 - 0.6, 0.0)], olive_shade, m, sides=10, cap=False)
        cnd.location = (x2 + 0.3, R2 * math.cos(a) * 1.0, R2 * math.sin(a) * 1.0)

    # nose fairing: ogive from 1.6 m to a rounded tip
    L = LENGTH / 2 - s3_end
    prof = []
    for i in range(17):
        f = i / 16
        rr = R2 * math.sqrt(max(0.0, 1 - f ** 1.6)) if i < 16 else 0.0
        prof.append((s3_end + f * L, max(rr, 0.0)))
    prof[-2] = (prof[-2][0], max(prof[-2][1], 0.08))
    lathe("nose", prof, nose_mat, m, cap=False)
    band("nose_joint", s3_end - 0.02, s3_end + 0.08, R2 + 0.01, ring, m)
    return m


def main():
    sc = studio(512 if PREVIEW else OUT * SSAA)
    m = build()

    if PREVIEW:
        m.rotation_euler = (0, 0, yaw_for(int(os.environ.get("YARS_DIR", "4"))))
        sc.render.filepath = PREVIEW
        bpy.ops.render.render(write_still=True)
        return

    parts = [o for o in sc.objects if o.type == "MESH"]
    is_team = {o.name for o in parts if o.active_material and o.active_material.name == "TEAM"}
    out = {p: np.zeros((OUT, OUT * DIRS, 4), np.float32) for p in SHEETS}
    for k in range(DIRS):
        m.rotation_euler = (0, 0, yaw_for(k))
        for sheet in SHEETS:
            mask = sheet.endswith("team")
            for o in parts:
                o.is_holdout = mask and o.name not in is_team
            cache = os.path.join(CACHE, f"{NAME}-{sheet}-{k:02d}.npy")
            if os.path.exists(cache):
                out[sheet][:, k * OUT : (k + 1) * OUT] = np.load(cache)
                continue
            rgb, alpha = grab(sc)
            out[sheet][:, k * OUT : (k + 1) * OUT, :3] = rgb
            out[sheet][:, k * OUT : (k + 1) * OUT, 3] = alpha
            np.save(cache, out[sheet][:, k * OUT : (k + 1) * OUT])
        print(f"[{NAME}] direction {k + 1}/{DIRS}", flush=True)
    for sheet, arr in out.items():
        img = bpy.data.images.new(f"{NAME}-{sheet}", OUT * DIRS, OUT, alpha=True)
        img.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
        img.filepath_raw = os.path.join(SPRITES, f"{NAME}-{sheet}.png")
        img.file_format = "PNG"
        img.save()
        print(f"[{NAME}] wrote {NAME}-{sheet}.png")
        for k in range(DIRS):
            c = os.path.join(CACHE, f"{NAME}-{sheet}-{k:02d}.npy")
            if os.path.exists(c):
                os.remove(c)
    if os.path.exists(TMP):
        os.remove(TMP)


main()

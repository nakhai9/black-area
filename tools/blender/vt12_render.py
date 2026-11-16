"""
VT 1-2 (Versuchsträger 1-2): West German twin-120 mm turretless tank prototype (MaK, 1975). Self-contained Blender
model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/vt12_render.py -- <faction> [SAMPLES] [--preview] [--side]

    <faction>  usa | russia | china | europe | islamic   (team colour = kit.py TEAM, on the side line)
    --preview  4 facings (NE, SE, SW, NW)                          -> tank-vt12-<faction>-preview.png
    --side     large 3/4 + side-on check images                    -> tank-vt12-<faction>-check-*.png

Dimensions (metres). [Unverified] figures from public sources on the prototype, cross-checked against the Takom 1/35
drawing: hull 6.90 long, 3.54 wide over the tracks, 2.12 high over the cupola (casemate roof ~1.95), guns overhang the
bow by ~2.6 m (9.5 m overall). Running gear read off the drawing: 6 road wheels a side (r 0.33), front idler, rear
drive sprocket, 3 return rollers. Twin 120 mm smoothbores fixed in the hull, one each side of a narrow casemate, each
with a fat mid-barrel sleeve; two big round fan grilles on the rear deck.

Paint: Bundeswehr yellow-olive (RAL 6014 style). Faction colour: a band along each hull side.
Sheet: 32 columns (ART_GUIDE 3: column 0 = bow straight up the screen, clockwise), one row, 96 px layout cells stored at
384 px (as the K9 Thunder sheet), the hull centre at PIVOT; tanks' px per metre (PX_PER_M), HEIGHT_SCALE 1.6.
Axes: +X bow (u), +Y left (v), +Z up (z).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from vehiclekit import box, cyl, hull, mat, model_yaw, node, setup, tube_between  # noqa: E402  (infrastructure only)

ROOT = os.path.dirname(os.path.dirname(HERE))
SPRITES = os.path.join(ROOT, "ui", "public", "sprites")
ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
TEAM = {"usa": "#2f6fe0", "russia": "#d22b2b", "china": "#e8b10a", "europe": "#6532d6", "islamic": "#1f9d4a"}  # = kit.py TEAM
FACTION = next((a for a in ARGS if a in TEAM), "europe")
PREVIEW = "--preview" in ARGS
SIDE = "--side" in ARGS
SAMPLES = next((int(a) for a in ARGS if a.isdigit()), 32)

CELL, DIRS, SS, OUT = 96, 32, 2, 384
PIVOT = (48, 54)
PX_PER_M = 42 / 7.77
HEIGHT_SCALE = 1.6

L = 6.90
FRONT, REAR = L / 2, -L / 2
TRACK_W, TRACK_Y = 0.62, 1.77 - 0.31  # track width, track centre line
WHEEL_R, WHEEL_Z = 0.33, 0.36
WHEELS_X = [2.30 - i * 0.90 for i in range(6)]  # 2.30 … -2.20
IDLER = (2.95, 0.58, 0.28)
SPROCKET = (-3.05, 0.66, 0.34)
RETURNS = [1.75, 0.0, -1.75]
DECK = 1.62  # top of the hull sides / sponson shelves
ROOF = 1.95  # casemate roof
GUN_Y, GUN_Z = 1.08, 1.70
GUN_BASE_X, GUN_LEN = 1.55, 4.45  # breech end inside the hull, length to the muzzle (~2.6 m past the bow)

PAL = dict(
    olive="#5c6440",
    olive_dark="#474e31",
    black="#1b1c1a",
    track="#2b2a27",
    rubber="#1f1f1d",
    steel="#626660",
    glass="#2b3540",
    lamp="#d9dcd2",
    red="#8c1c16",
    mesh="#26282a",
    bore="#0c0c0c",
)


def mats():
    m = {k: mat(k, v, rough=0.64) for k, v in PAL.items()}
    m["track"] = mat("track", PAL["track"], rough=0.55, metal=0.5)
    m["rubber"] = mat("rubber", PAL["rubber"], rough=0.9, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    m["lamp"] = mat("lamp", PAL["lamp"], rough=0.1, grime=False)
    m["red"] = mat("red", PAL["red"], rough=0.25, grime=False)
    m["mesh"] = mat("mesh", PAL["mesh"], rough=0.5, metal=0.6)
    m["bore"] = mat("bore", PAL["bore"], rough=0.9, grime=False)
    m["team"] = mat("team", TEAM[FACTION], rough=0.5)
    return m


# ------------------------------------------------------------------ running gear


def road_wheel(name, x, z, r, s, M, root, dish=True):
    y = s * TRACK_Y
    cyl(f"{name}_out", (x, y + s * 0.15, z), r, 0.24, "Y", M["rubber"], root, 32)
    cyl(f"{name}_in", (x, y - s * 0.15, z), r, 0.24, "Y", M["rubber"], root, 32)
    cyl(f"{name}_rim", (x, y + s * 0.28, z), r * 0.82, 0.03, "Y", M["olive"], root, 28)
    if dish:
        cyl(f"{name}_dish", (x, y + s * 0.3, z), r * 0.55, 0.04, "Y", M["olive_dark"], root, 24)
        for k in range(6):
            a = k / 6 * 2 * math.pi
            cyl(f"{name}_bolt{k}", (x + 0.12 * r / 0.33 * math.cos(a), y + s * 0.33, z + 0.12 * r / 0.33 * math.sin(a)), 0.018, 0.03, "Y", M["steel"], root, 6)
    cyl(f"{name}_hub", (x, y + s * 0.34, z), r * 0.2, 0.06, "Y", M["steel"], root, 12)


def build_tracks(root, M):
    # the track loop round sprocket, idler and road wheels, as segments of a belt with cleats on the outer face
    pts = []
    for (x, z, r) in [IDLER, SPROCKET] + [(wx, WHEEL_Z, WHEEL_R) for wx in WHEELS_X]:
        for k in range(24):
            a = k / 24 * 2 * math.pi
            pts.append((x + (r + 0.05) * math.cos(a), z + (r + 0.05) * math.sin(a)))
    # top run sits on the return rollers
    for x in RETURNS:
        pts.append((x, 1.05))
    # 2D convex hull in XZ
    pts = sorted(set((round(px, 3), round(pz, 3)) for px, pz in pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    loop = lower[:-1] + upper[:-1]
    n = len(loop)
    for s in (-1, 1):
        y0 = s * TRACK_Y
        for i in range(n):
            a, b = loop[i], loop[(i + 1) % n]
            # belt segment 7 cm thick, inward from the outline
            ax, az = a
            bx, bz = b
            dx, dz = bx - ax, bz - az
            ln = math.hypot(dx, dz) or 1
            nx, nz = dz / ln, -dx / ln  # outward normal (loop is counter-clockwise)
            seg = [(px + ox, y0 + yy, pz + oz) for px, pz in (a, b) for (ox, oz) in ((0, 0), (-nx * 0.07, -nz * 0.07)) for yy in (-TRACK_W / 2, TRACK_W / 2)]
            hull(f"track{s}_{i}", seg, M["track"], root, 0.0)
            # cleats every ~0.16 m along the segment
            for k in range(max(1, int(ln / 0.16))):
                t = (k + 0.5) / max(1, int(ln / 0.16))
                cx, cz = ax + dx * t, az + dz * t
                cl = box(f"cleat{s}_{i}_{k}", (0, 0, 0), (0.06, TRACK_W * 0.92, 0.03), M["track"], root, 0.0)
                cl.location = (cx + nx * 0.015, y0, cz + nz * 0.015)
                cl.rotation_euler = (0, -math.atan2(dz, dx), 0)
        for i, x in enumerate(WHEELS_X):
            road_wheel(f"rw{s}_{i}", x, WHEEL_Z, WHEEL_R, s, M, root)
        road_wheel(f"idler{s}", IDLER[0], IDLER[1], IDLER[2], s, M, root, dish=False)
        # drive sprocket: toothed ring
        x, z, r = SPROCKET
        cyl(f"spr{s}", (x, s * TRACK_Y, z), r * 0.9, 0.42, "Y", M["olive_dark"], root, 28)
        for k in range(12):
            a = k / 12 * 2 * math.pi
            t = box(f"tooth{s}_{k}", (r * 0.95, 0, 0), (0.08, 0.36, 0.07), M["olive_dark"], root, 0.005)
            t.location = (x, s * TRACK_Y, z)
            t.rotation_euler = (0, -a, 0)
        cyl(f"spr_hub{s}", (x, s * (TRACK_Y + 0.24), z), 0.12, 0.08, "Y", M["steel"], root, 14)
        for x in RETURNS:
            cyl(f"ret{s}{x:.1f}", (x, s * (TRACK_Y - 0.05), 1.0), 0.09, 0.2, "Y", M["rubber"], root, 16)


# ------------------------------------------------------------------ hull


def build_hull(root, M):
    hw = 1.77  # over the sponsons (= track outer edge)
    lw = 1.12  # lower hull between the tracks
    # lower hull: belly between the tracks, sloped lower glacis and rear plate
    hull("lower_hull", [(x, s * lw, z) for s in (-1, 1) for (x, z) in ((FRONT - 0.35, 0.42), (FRONT, 0.72), (REAR + 0.15, 0.42), (REAR, 0.75))] + [(x, s * lw, 1.1) for s in (-1, 1) for x in (FRONT - 0.2, REAR)], M["olive"], root, 0.02)
    # sponsons over the tracks, full width, flat top at DECK; bow slopes down to the nose
    hull("sponsons", [(x, s * hw, z) for s in (-1, 1) for (x, z) in ((FRONT - 0.05, 0.95), (FRONT - 0.55, DECK - 0.1), (REAR + 0.05, DECK - 0.05), (REAR, 1.02), (FRONT - 0.05, 1.05), (REAR + 0.02, 1.05))], M["olive"], root, 0.025)
    # upper glacis: long slope from the nose up to the casemate front, narrower than the hull (the guns ride outside it)
    cw = 0.86  # casemate half-width
    hull("glacis", [(x, s * y, z) for s in (-1, 1) for (x, y, z) in ((FRONT - 0.02, hw - 0.12, 1.0), (FRONT - 0.02, cw, 1.02), (1.55, cw, ROOF), (1.55, cw + 0.05, DECK))], M["olive"], root, 0.02)
    # casemate: crew and gun compartment, front plate sloped, sides vertical, flat roof back to the engine bay
    hull("casemate", [(x, s * y, z) for s in (-1, 1) for (x, y, z) in ((1.55, cw, ROOF), (1.55, cw, DECK), (-0.55, hw - 0.04, DECK), (-0.55, hw - 0.08, ROOF - 0.04), (0.6, cw, ROOF), (0.6, cw, DECK))], M["olive"], root, 0.025)
    # side boxes behind the guns (ammunition / autoloader housings) bridge casemate and hull edge
    for s in (-1, 1):
        hull(f"loader_box{s}", [(x, s * y, z) for (x, z) in ((1.1, DECK), (1.1, ROOF - 0.12), (-0.55, DECK), (-0.55, ROOF - 0.06)) for y in (cw - 0.02, hw - 0.04)], M["olive"], root, 0.02)
    # engine deck: full width, a little lower than the casemate, sloping to the rear plate
    hull("engine_deck", [(x, s * y, z) for s in (-1, 1) for (x, y, z) in ((-0.55, hw - 0.04, ROOF - 0.06), (REAR + 0.25, hw - 0.04, ROOF - 0.1), (REAR, hw - 0.06, DECK - 0.15), (-0.55, hw - 0.04, DECK - 0.1), (REAR, hw - 0.06, 1.05))], M["olive"], root, 0.025)

    # faction band along each side of the hull, from the bow slope to the stern
    for s in (-1, 1):
        hull(f"team_band{s}", [(x, s * (hw + 0.006), z) for x in (FRONT - 0.6, REAR + 0.1) for z in (1.22, 1.38)], M["team"], root, 0.0)
        # round smoke-mortar / vision ports on the casemate side (the two circles of the drawing)
        for (x, z, r) in ((0.85, 1.55, 0.22), (0.55, 1.2, 0.13)):
            cyl(f"port{s}{x}", (x, s * (hw + 0.01), z), r, 0.03, "Y", M["olive_dark"], root, 24)
        # row of bolt heads along the side plate seam
        for k in range(12):
            box(f"rivet{s}{k}", (-0.4 - k * 0.24, s * (hw + 0.008), 1.5), (0.03, 0.01, 0.03), M["olive_dark"], root, 0.0)
        # tow eyes front and rear, tail light, headlight with guard
        cyl(f"tow_f{s}", (FRONT - 0.05, s * 0.9, 0.85), 0.06, 0.08, "X", M["steel"], root, 10)
        cyl(f"tow_r{s}", (REAR - 0.03, s * 1.2, 1.15), 0.06, 0.08, "X", M["steel"], root, 10)
        box(f"taillight{s}", (REAR - 0.01, s * 1.4, 1.45), (0.04, 0.2, 0.1), M["red"], root, 0.006)
        cyl(f"headlamp{s}", (FRONT - 0.18, s * 0.55, 1.12), 0.08, 0.08, "X", M["lamp"], root, 16)
        cyl(f"headlamp_rim{s}", (FRONT - 0.22, s * 0.55, 1.12), 0.1, 0.06, "X", M["olive_dark"], root, 16)
        # rear mudguard plates over the sprockets
        box(f"rear_guard{s}", (REAR + 0.15, s * TRACK_Y, 1.08), (0.3, TRACK_W, 0.04), M["olive"], root, 0.008)

    # rear plate: exhaust louvre grille and stowage box
    box("exhaust_grille", (REAR - 0.005, 0, 1.45), (0.03, 1.4, 0.32), M["mesh"], root, 0.0)
    for k in range(7):
        box(f"louvre{k}", (REAR - 0.02, 0, 1.33 + k * 0.04), (0.02, 1.38, 0.015), M["olive_dark"], root, 0.0)
    box("rear_box", (REAR - 0.1, 0, 1.12), (0.2, 1.0, 0.24), M["olive"], root, 0.015)

    # engine deck: two big round fan grilles, access hatches, track spares
    for s in (-1, 1):
        cyl(f"fan_ring{s}", (-2.55, s * 0.62, ROOF - 0.08), 0.48, 0.05, "Z", M["olive_dark"], root, 40)
        cyl(f"fan_mesh{s}", (-2.55, s * 0.62, ROOF - 0.055), 0.42, 0.02, "Z", M["mesh"], root, 40)
        for k in range(8):
            a = k / 8 * math.pi
            bar = box(f"fan_bar{s}{k}", (0, 0, 0), (0.82, 0.02, 0.01), M["olive_dark"], root, 0.0)
            bar.location = (-2.55, s * 0.62, ROOF - 0.04)
            bar.rotation_euler = (0, 0, a)
        box(f"deck_hatch{s}", (-1.35, s * 0.6, ROOF - 0.05), (0.55, 0.5, 0.03), M["olive_dark"], root, 0.008)
        box(f"spare_links{s}", (-0.95, s * 0.25, ROOF - 0.04), (0.28, 0.2, 0.05), M["track"], root, 0.005)
    # casemate roof: commander's cupola with periscopes, gunner's sight head, driver's hatch, searchlight, antenna
    cyl("cupola", (0.35, 0.45, ROOF + 0.07), 0.3, 0.14, "Z", M["olive"], root, 32)
    cyl("cupola_lid", (0.35, 0.45, ROOF + 0.16), 0.26, 0.05, "Z", M["olive_dark"], root, 32)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        box(f"periscope{k}", (0.35 + 0.29 * math.cos(a), 0.45 + 0.29 * math.sin(a), ROOF + 0.1), (0.07, 0.07, 0.06), M["glass"], root, 0.0)
    box("sight_head", (0.95, -0.35, ROOF + 0.12), (0.3, 0.26, 0.24), M["olive"], root, 0.015)
    box("sight_glass", (1.105, -0.35, ROOF + 0.14), (0.01, 0.2, 0.1), M["glass"], root, 0.0)
    box("driver_hatch", (1.2, 0.2, ROOF + 0.02), (0.4, 0.45, 0.04), M["olive_dark"], root, 0.008)
    box("searchlight", (1.25, 0.65, ROOF + 0.18), (0.18, 0.2, 0.2), M["olive_dark"], root, 0.01)
    cyl("searchlight_lens", (1.345, 0.65, ROOF + 0.18), 0.07, 0.01, "X", M["lamp"], root, 14)
    tube_between("searchlight_post", (1.25, 0.65, ROOF), (1.25, 0.65, ROOF + 0.08), 0.03, M["black"], root, 8)
    tube_between("antenna", (-3.0, 1.35, ROOF - 0.1), (-3.12, 1.35, ROOF + 1.6), 0.012, M["black"], root, 6)
    cyl("antenna_base", (-3.0, 1.35, ROOF - 0.06), 0.06, 0.1, "Z", M["black"], root, 10)
    for k in range(2):
        tube_between(f"grab{k}", (-0.2 - k * 0.6, -1.5, ROOF - 0.02), (-0.6 - k * 0.6, -1.5, ROOF - 0.02), 0.012, M["black"], root, 6)


# ------------------------------------------------------------------ guns


def build_guns(root, M):
    for s in (-1, 1):
        y = s * GUN_Y
        x0 = GUN_BASE_X
        # armoured mantlet block where the gun leaves the hull, and a cradle box on the sponson shelf
        hull(f"mantlet{s}", [(x, y + dy, z) for x in (x0 - 0.1, x0 + 0.45) for dy in (-0.24, 0.24) for z in (DECK - 0.05, GUN_Z + 0.22)] + [(x0 + 0.65, y + dy, GUN_Z + dz) for dy in (-0.17, 0.17) for dz in (-0.17, 0.17)], M["olive"], root, 0.025)
        cyl(f"collar{s}", (x0 + 0.75, y, GUN_Z), 0.15, 0.22, "X", M["olive_dark"], root, 24)
        # barrel: tapering tube with the fat mid-barrel sleeve (thermal / bore evacuator section) and a plain muzzle
        cyl(f"barrel_root{s}", (x0 + 1.3, y, GUN_Z), 0.1, 0.9, "X", M["olive"], root, 24, radius2=0.09)
        cyl(f"sleeve_in{s}", (x0 + 1.86, y, GUN_Z), 0.09, 0.24, "X", M["olive"], root, 24, radius2=0.13)
        cyl(f"sleeve{s}", (x0 + 2.3, y, GUN_Z), 0.13, 0.66, "X", M["olive"], root, 28)
        cyl(f"sleeve_out{s}", (x0 + 2.75, y, GUN_Z), 0.13, 0.24, "X", M["olive"], root, 24, radius2=0.085)
        cyl(f"barrel{s}", (x0 + 3.6, y, GUN_Z), 0.085, 1.48, "X", M["olive"], root, 24, radius2=0.08)
        cyl(f"muzzle{s}", (x0 + GUN_LEN - 0.08, y, GUN_Z), 0.095, 0.16, "X", M["olive_dark"], root, 24)
        cyl(f"bore{s}", (x0 + GUN_LEN + 0.002, y, GUN_Z), 0.06, 0.01, "X", M["bore"], root, 18)
        # canvas band at the sleeve joint (the dark ring on the references)
        cyl(f"band{s}", (x0 + 1.98, y, GUN_Z), 0.135, 0.07, "X", M["olive_dark"], root, 24)


# ------------------------------------------------------------------ rendering


def camera(sc, ortho, pivot=PIVOT, cell=CELL):
    cd = bpy.data.cameras.new("sheetcam")
    cd.type = "ORTHO"
    cd.ortho_scale = ortho
    cd.clip_end = 300
    cam = bpy.data.objects.new("sheetcam", cd)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(60), 0, 0)
    q = cam.rotation_euler.to_quaternion()
    up, back = q @ Vector((0, 1, 0)), q @ Vector((0, 0, 1))
    ppm = cell / ortho
    cam.location = up * ((pivot[1] - cell / 2) / ppm) - Vector((1, 0, 0)) * ((pivot[0] - cell / 2) / ppm) + back * 60
    sc.camera = cam
    return cam


def smooth(objs):
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38), keep_sharp_edges=True)
    for o in objs:
        o.select_set(False)


def shoot(sc, rig, path, cols):
    big = OUT * SS
    acc = np.zeros((OUT, OUT * len(cols), 4), np.float32)
    tmp = os.path.join(os.environ.get("TEMP", HERE), f"vt12-{FACTION}-{os.path.basename(path)}.tmp.png")
    for i, k in enumerate(cols):
        rig.rotation_euler = (0, 0, model_yaw(k))
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(tmp)
        buf = np.empty(big * big * 4, np.float32)
        im.pixels.foreach_get(buf)
        bpy.data.images.remove(im)
        buf = buf.reshape(OUT, SS, OUT, SS, 4)
        a = buf[..., 3].mean((1, 3))
        rgb = (buf[..., :3] * buf[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
        acc[:, i * OUT : (i + 1) * OUT, :3] = rgb
        acc[:, i * OUT : (i + 1) * OUT, 3] = a
        print(f"[vt12-{FACTION}] {i + 1}/{len(cols)}", flush=True)
    img = bpy.data.images.new(os.path.basename(path), OUT * len(cols), OUT, alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    os.remove(tmp)
    print(f"[vt12-{FACTION}] wrote {path}", flush=True)


def main():
    sc, _floor = setup(OUT * SS, SAMPLES)
    M = mats()
    rig = node("Rig", (0, 0, 0), None)
    rig.scale = (1, 1, HEIGHT_SCALE)
    body = node("Body", (0, 0, 0), rig)
    build_tracks(body, M)
    build_hull(body, M)
    build_guns(body, M)
    smooth([o for o in sc.objects if o.type == "MESH" and o.name != "Floor"])
    if SIDE:
        sc.render.resolution_x = sc.render.resolution_y = 1024
        cam = camera(sc, 11.0, pivot=(48, 52))
        rig.rotation_euler = (0, 0, model_yaw(28))
        sc.render.filepath = os.path.join(SPRITES, f"tank-vt12-{FACTION}-check-34.png")
        bpy.ops.render.render(write_still=True)
        cam.rotation_euler = (math.radians(90), 0, 0)
        cam.location = (0.8, -60, 1.6 * HEIGHT_SCALE)
        rig.rotation_euler = (0, 0, 0)
        sc.render.filepath = os.path.join(SPRITES, f"tank-vt12-{FACTION}-check-side.png")
        bpy.ops.render.render(write_still=True)
        return
    camera(sc, CELL / PX_PER_M)
    if PREVIEW:
        shoot(sc, rig, os.path.join(SPRITES, f"tank-vt12-{FACTION}-preview.png"), (4, 12, 20, 28))
    else:
        shoot(sc, rig, os.path.join(SPRITES, f"tank-vt12-{FACTION}.png"), range(DIRS))


main()

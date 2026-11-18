"""
Twin-gun heavy tank (Japan's holder). Original design built from the reference photos of a twin-barrel scale model
(no blueprint exists): a long T-80-style hull with six road wheels a side, a low rounded cast turret carrying two
125 mm smoothbores side by side, each with a fume extractor, thermal sleeve bands and a plain muzzle; reactive-armour
bricks on the turret cheeks, a commander's cupola with a roof machine gun, smoke dischargers, an ammo / stowage bin
round the turret rear, two drum fuel tanks and an unditching beam across the hull rear, ribbed side skirts with
armour panels, mesh engine deck. Self-contained Blender model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/twintank_render.py -- <faction> [SAMPLES] [--preview] [--side]

    <faction>  usa | russia | china | europe | islamic   (team colour = kit.py TEAM)
    --preview  4 facings of hull + turret                  -> tank-twin-<faction>-preview.png
    --side     large 3/4 + side-on check images             -> tank-twin-<faction>-check-*.png

Dimensions (metres) [Inference: proportions read off the photos, scaled to a T-80 hull]: hull 7.0 long, 3.6 wide over
the skirts, turret roof 2.2, guns 5.6 long from the trunnions (about 3.3 m past the bow). Paint: JGSDF olive drab.
Faction colour: a band round the turret sides and one along each side skirt.

Sheets: 32 columns (ART_GUIDE 3: column 0 = nose straight up the screen, clockwise), one row, 96 px layout cells stored
at 384 px, the ground point under the turret ring at PIVOT; tanks' px per metre (PX_PER_M), HEIGHT_SCALE 1.6.
    tank-twin-<faction>-hull.png    hull + its soft shadow
    tank-twin-<faction>-turret.png  turret + guns, drawn over the hull, turns on its own (no shadow)
The model origin is the turret ring centre, so both sheets share one pivot.
Axes: +X front (u), +Y left (v), +Z up (z).
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
FACTION = next((a for a in ARGS if a in TEAM), "neutral")
TEAM["neutral"] = "#c8c8c8"  # neutral grey: the -team mask carries the faction colour (tinted in the game)
PREVIEW = "--preview" in ARGS
SIDE = "--side" in ARGS
SAMPLES = next((int(a) for a in ARGS if a.isdigit()), 32)

CELL, DIRS, SS, OUT = 96, 32, 2, 384
PIVOT = (48, 54)
PX_PER_M = 42 / 7.77
HEIGHT_SCALE = 1.6

RING_X = 0.45  # turret ring centre ahead of the hull middle; the model origin sits on it
FRONT, REAR = 3.5 - RING_X, -3.5 - RING_X
TRACK_W, TRACK_Y = 0.58, 1.8 - 0.29
WHEEL_R, WHEEL_Z = 0.34, 0.37
WHEELS_X = [2.05 - RING_X - i * 0.86 for i in range(6)]
IDLER = (2.95 - RING_X, 0.55, 0.3)
SPROCKET = (-3.1 - RING_X, 0.62, 0.33)
RETURNS = [1.4 - RING_X, 0.1 - RING_X, -1.2 - RING_X]
DECK = 1.42  # hull roof
SKIRT = 1.8  # half width over the side skirts
T_BASE, T_ROOF = DECK, 2.18
GUN_Y, GUN_Z, GUN_LEN = 0.52, 1.88, 5.6

PAL = dict(
    olive="#4d5434",
    olive_dark="#3b4128",
    olive_light="#5d6541",
    black="#1b1c1a",
    track="#2b2a27",
    rubber="#1f1f1d",
    steel="#5f625c",
    glass="#2b3540",
    lamp="#d9dcd2",
    red="#8c1c16",
    mesh="#262824",
    bore="#0c0c0c",
    wood="#6b5236",
)


def mats():
    m = {k: mat(k, v, rough=0.68) for k, v in PAL.items()}
    m["track"] = mat("track", PAL["track"], rough=0.55, metal=0.5)
    m["rubber"] = mat("rubber", PAL["rubber"], rough=0.9, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    m["lamp"] = mat("lamp", PAL["lamp"], rough=0.1, grime=False)
    m["red"] = mat("red", PAL["red"], rough=0.25, grime=False)
    m["mesh"] = mat("mesh", PAL["mesh"], rough=0.5, metal=0.6)
    m["bore"] = mat("bore", PAL["bore"], rough=0.9, grime=False)
    m["team"] = mat("team", TEAM[FACTION], rough=0.5, grime=False)
    return m


def rbox(name, c, size, material, root, bevel, ry=0.0, rz=0.0):
    """Box centred on c, turned ry about Y (pitch) then rz about Z (yaw) round its own centre."""
    pts = []
    for i in (-1, 1):
        for j in (-1, 1):
            for k in (-1, 1):
                x, y, z = i * size[0] / 2, j * size[1] / 2, k * size[2] / 2
                x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
                x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
                pts.append((c[0] + x, c[1] + y, c[2] + z))
    return hull(name, pts, material, root, bevel)


# ------------------------------------------------------------------ running gear


def road_wheel(name, x, z, r, s, M, root, dish=True):
    y = s * TRACK_Y
    cyl(f"{name}_out", (x, y + s * 0.14, z), r, 0.22, "Y", M["rubber"], root, 32)
    cyl(f"{name}_in", (x, y - s * 0.14, z), r, 0.22, "Y", M["rubber"], root, 32)
    cyl(f"{name}_rim", (x, y + s * 0.26, z), r * 0.84, 0.03, "Y", M["olive"], root, 28)
    if dish:
        cyl(f"{name}_dish", (x, y + s * 0.28, z), r * 0.6, 0.04, "Y", M["olive_dark"], root, 24)
        for k in range(8):
            a = k / 8 * 2 * math.pi
            cyl(f"{name}_rib{k}", (x + 0.17 * r / 0.34 * math.cos(a), y + s * 0.3, z + 0.17 * r / 0.34 * math.sin(a)), 0.025, 0.03, "Y", M["olive_dark"], root, 6)
    cyl(f"{name}_hub", (x, y + s * 0.32, z), r * 0.22, 0.06, "Y", M["steel"], root, 12)


def build_tracks(root, M):
    pts = []
    for (x, z, r) in [IDLER, SPROCKET] + [(wx, WHEEL_Z, WHEEL_R) for wx in WHEELS_X]:
        for k in range(24):
            a = k / 24 * 2 * math.pi
            pts.append((x + (r + 0.05) * math.cos(a), z + (r + 0.05) * math.sin(a)))
    for x in RETURNS:
        pts.append((x, 1.0))
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
            (ax, az), (bx, bz) = loop[i], loop[(i + 1) % n]
            dx, dz = bx - ax, bz - az
            ln = math.hypot(dx, dz) or 1
            nx, nz = dz / ln, -dx / ln
            seg = [(px + ox, y0 + yy, pz + oz) for px, pz in ((ax, az), (bx, bz)) for (ox, oz) in ((0, 0), (-nx * 0.07, -nz * 0.07)) for yy in (-TRACK_W / 2, TRACK_W / 2)]
            hull(f"track{s}_{i}", seg, M["track"], root, 0.0)
            cnt = max(1, int(ln / 0.15))
            for k in range(cnt):
                t = (k + 0.5) / cnt
                cl = box(f"cleat{s}_{i}_{k}", (0, 0, 0), (0.06, TRACK_W * 0.92, 0.03), M["track"], root, 0.0)
                cl.location = (ax + dx * t + nx * 0.015, y0, az + dz * t + nz * 0.015)
                cl.rotation_euler = (0, -math.atan2(dz, dx), 0)
        for i, x in enumerate(WHEELS_X):
            road_wheel(f"rw{s}_{i}", x, WHEEL_Z, WHEEL_R, s, M, root)
        road_wheel(f"idler{s}", IDLER[0], IDLER[1], IDLER[2], s, M, root, dish=False)
        x, z, r = SPROCKET
        cyl(f"spr{s}", (x, s * TRACK_Y, z), r * 0.9, 0.4, "Y", M["olive_dark"], root, 28)
        for k in range(12):
            t = box(f"tooth{s}_{k}", (r * 0.95, 0, 0), (0.08, 0.34, 0.07), M["olive_dark"], root, 0.005)
            t.location = (x, s * TRACK_Y, z)
            t.rotation_euler = (0, -k / 12 * 2 * math.pi, 0)
        for x in RETURNS:
            cyl(f"ret{s}{x:.1f}", (x, s * (TRACK_Y - 0.05), 0.97), 0.08, 0.2, "Y", M["rubber"], root, 16)


# ------------------------------------------------------------------ hull


def build_hull(root, M):
    O, D = M["olive"], M["olive_dark"]
    lw = 1.15
    # lower hull and the sharp two-plate bow (upper glacis long and shallow, lower glacis short)
    hull("lower_hull", [(x, s * lw, z) for s in (-1, 1) for (x, z) in ((FRONT - 0.45, 0.42), (FRONT, 0.8), (REAR + 0.15, 0.42), (REAR, 0.85), (FRONT - 0.1, 1.1), (REAR, 1.1))], O, root, 0.02)
    hull("upper_hull", [(x, s * y, z) for s in (-1, 1) for (x, y, z) in ((FRONT, SKIRT - 0.35, 0.85), (FRONT - 1.4, SKIRT - 0.05, DECK), (REAR, SKIRT - 0.05, DECK), (REAR, SKIRT - 0.05, 1.0), (FRONT - 0.05, SKIRT - 0.2, 0.8))], O, root, 0.025)
    # glacis armour add-on blocks (the ribbed slabs on the bow) and the dozer-style splash board
    for i in range(3):
        for s in (-1, 1):
            x0 = FRONT - 0.25 - i * 0.42
            z0 = 0.95 + i * 0.15
            rbox(f"glacis_blk{i}{s}", (x0, s * 0.65, z0), (0.38, 1.0, 0.1), O, root, 0.01, ry=math.radians(20))
            for k in range(3):
                rbox(f"glacis_rib{i}{s}{k}", (x0, s * (0.35 + k * 0.3), z0 + 0.06), (0.34, 0.04, 0.03), D, root, 0.0, ry=math.radians(20))
    box("splash_board", (FRONT - 1.2, 0, DECK + 0.03), (0.08, 2.0, 0.08), D, root, 0.01)
    # driver's hatch and vision blocks on the glacis
    box("driver_hatch", (FRONT - 1.45, 0, DECK + 0.02), (0.45, 0.5, 0.04), D, root, 0.008)
    box("driver_vis", (FRONT - 1.2, 0, DECK + 0.04), (0.06, 0.32, 0.06), M["glass"], root, 0.0)
    # side skirts: rubber/steel panels with armour plates (front three heavier), ribbed
    for s in (-1, 1):
        y = s * SKIRT
        hull(f"skirt{s}", [(x, y + s * dy, z) for (x, z) in ((FRONT - 0.3, 1.38), (REAR + 0.1, 1.38), (REAR + 0.1, 0.78), (FRONT - 0.6, 0.72)) for dy in (-0.04, 0.0)], O, root, 0.01)
        for k in range(6):
            x = FRONT - 0.85 - k * 0.98
            box(f"skirt_plate{s}{k}", (x, y + s * 0.03, 1.08), (0.9, 0.05, 0.56), O if k > 2 else M["olive_light"], root, 0.012)
            for j in range(2):
                box(f"skirt_rib{s}{k}{j}", (x - 0.2 + j * 0.4, y + s * 0.065, 1.08), (0.04, 0.02, 0.48), D, root, 0.0)
        # faction line along the skirt top
        hull(f"team_skirt{s}", [(x, y + s * 0.072, z) for x in (FRONT - 0.5, REAR + 0.2) for z in (1.22, 1.33)], M["team"], root, 0.0)
        # stowage boxes on the fenders behind the turret
        for k, x in enumerate((-1.3 - RING_X, -2.0 - RING_X, -2.7 - RING_X)):
            box(f"fender_box{s}{k}", (x, s * (SKIRT - 0.32), DECK + 0.17), (0.62, 0.5, 0.34), O, root, 0.015)
            box(f"fender_lid{s}{k}", (x, s * (SKIRT - 0.32), DECK + 0.35), (0.6, 0.48, 0.03), D, root, 0.005)
        # headlights with guards, tow hooks front and rear
        cyl(f"headlamp{s}", (FRONT - 0.5, s * 1.35, 1.12), 0.07, 0.08, "X", M["lamp"], root, 14)
        box(f"lamp_guard{s}", (FRONT - 0.48, s * 1.35, 1.2), (0.06, 0.2, 0.03), D, root, 0.0)
        cyl(f"tow_f{s}", (FRONT - 0.08, s * 0.85, 0.82), 0.07, 0.08, "X", M["steel"], root, 10)
        cyl(f"tow_r{s}", (REAR - 0.03, s * 1.05, 0.95), 0.07, 0.08, "X", M["steel"], root, 10)
        box(f"taillight{s}", (REAR - 0.02, s * 1.45, 1.25), (0.04, 0.16, 0.08), M["red"], root, 0.004)
    # engine deck: mesh grilles with frames, access panels
    for k in range(2):
        x = -1.45 - RING_X - k * 0.95
        box(f"deck_grille{k}", (x, 0, DECK + 0.015), (0.8, 1.8, 0.02), M["mesh"], root, 0.0)
        for j in range(7):
            box(f"deck_bar{k}{j}", (x, -0.78 + j * 0.26, DECK + 0.03), (0.78, 0.03, 0.02), D, root, 0.0)
    box("deck_panel", (-3.2 - RING_X, 0, DECK + 0.02), (0.45, 2.0, 0.04), D, root, 0.008)
    # rear: two drum fuel tanks on cradles and an unditching beam across the stern (the photos' big rear cylinders)
    for s in (-1, 1):
        cyl(f"drum{s}", (REAR + 0.15, s * 0.75, DECK + 0.4), 0.38, 0.95, "Y", O, root, 32)
        for dy in (-0.32, 0.0, 0.32):
            cyl(f"drum_hoop{s}{dy}", (REAR + 0.15, s * 0.75 + dy, DECK + 0.4), 0.395, 0.05, "Y", D, root, 32)
        cyl(f"drum_cap{s}", (REAR + 0.15, s * (0.75 + 0.48), DECK + 0.4), 0.3, 0.03, "Y", D, root, 24)
        box(f"drum_cradle{s}", (REAR + 0.15, s * 0.75, DECK + 0.04), (0.5, 0.8, 0.08), M["black"], root, 0.005)
    cyl("beam", (REAR + 0.72, 0, DECK + 0.14), 0.13, 2.9, "Y", M["wood"], root, 16)
    for s in (-1, 1):
        box(f"beam_strap{s}", (REAR + 0.72, s * 1.0, DECK + 0.14), (0.3, 0.05, 0.3), M["black"], root, 0.0)
    box("rear_plate_grille", (REAR - 0.01, 0, 1.2), (0.03, 2.2, 0.3), M["mesh"], root, 0.0)
    # radio antenna base on the hull rear
    cyl("ant_base", (-1.9 - RING_X, -1.2, DECK + 0.05), 0.05, 0.1, "Z", M["black"], root, 10)


# ------------------------------------------------------------------ turret (origin = ring centre)


def build_turret(root, M):
    O, D = M["olive"], M["olive_dark"]
    # low rounded cast turret: wide flat-sided bowl, cheeks swept back, longer bustle
    pts = []
    for (x, y) in ((1.35, 0.6), (1.2, 1.25), (0.5, 1.55), (-0.5, 1.6), (-1.3, 1.45), (-1.75, 1.0), (-1.85, 0.0)):
        for s in (-1, 1):
            pts += [(x, s * y, T_BASE + 0.02), (x * 0.92, s * y * 0.9, T_ROOF - 0.06)]
    for (x, y) in ((0.8, 0.5), (0.2, 1.05), (-0.8, 1.05), (-1.4, 0.6)):
        for s in (-1, 1):
            pts.append((x, s * y, T_ROOF))
    t = hull("turret", pts, O, root, 0.03)
    for p in t.data.polygons:
        p.use_smooth = True
    # reactive-armour bricks on the front cheeks (two rows, angled), stepped like the photos
    for s in (-1, 1):
        for row in range(2):
            for k in range(4):
                x = 1.15 - k * 0.3
                y = s * (0.95 + k * 0.14)
                rbox(f"era{s}{row}{k}", (x, y, T_BASE + 0.32 + row * 0.26), (0.26, 0.42, 0.22), O, root, 0.012, rz=s * math.radians(28))
    # faction band round the turret sides and bustle
    for s in (-1, 1):
        hull(f"team_turret{s}", [(x, s * y, z) for (x, y) in ((0.35, 1.565), (-1.3, 1.465)) for z in (T_BASE + 0.18, T_BASE + 0.3)] + [(x, s * (y + 0.02), z) for (x, y) in ((0.35, 1.565), (-1.3, 1.465)) for z in (T_BASE + 0.18, T_BASE + 0.3)], M["team"], root, 0.0)
    # stowage bin round the bustle
    hull("bustle_bin", [(x, s * y, z) for s in (-1, 1) for (x, y) in ((-1.55, 1.35), (-2.05, 0.95), (-2.1, 0.0)) for z in (T_BASE + 0.25, T_BASE + 0.65)], D, root, 0.015)
    for k in range(5):
        box(f"bin_rib{k}", (-2.07, -0.8 + k * 0.4, T_BASE + 0.45), (0.04, 0.03, 0.38), O, root, 0.0)
    # snorkel tube along the left rear of the turret (the long pipe on the photos)
    cyl("snorkel", (-0.9, 1.45, T_BASE + 0.62), 0.11, 1.9, "X", O, root, 20)
    for x in (-1.6, -0.2):
        box(f"snorkel_clamp{x}", (x, 1.45, T_BASE + 0.62), (0.06, 0.26, 0.26), D, root, 0.0)
    # smoke dischargers: a fan of four tubes each side of the gun mantlet
    for s in (-1, 1):
        for k in range(4):
            a = math.radians(15 + k * 18)
            p0 = (0.55 - k * 0.12, s * (1.2 + k * 0.05), T_ROOF - 0.02)
            p1 = (p0[0] + 0.32 * math.cos(a), p0[1] + s * 0.32 * math.sin(a) * 0.4, p0[2] + 0.2)
            tube_between(f"smoke{s}{k}", p0, p1, 0.045, D, root, 10)
    # commander's cupola with periscopes and a roof machine gun on a ring; gunner's sight box
    cyl("cupola", (-0.45, 0.7, T_ROOF + 0.08), 0.36, 0.16, "Z", O, root, 32)
    cyl("cupola_lid", (-0.45, 0.7, T_ROOF + 0.18), 0.3, 0.05, "Z", D, root, 32)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        box(f"peri{k}", (-0.45 + 0.34 * math.cos(a), 0.7 + 0.34 * math.sin(a), T_ROOF + 0.12), (0.07, 0.07, 0.06), M["glass"], root, 0.0)
    tube_between("mg_post", (-0.25, 0.7, T_ROOF + 0.18), (-0.25, 0.7, T_ROOF + 0.42), 0.03, M["black"], root, 8)
    box("mg_body", (-0.15, 0.7, T_ROOF + 0.45), (0.6, 0.1, 0.12), M["black"], root, 0.005)
    cyl("mg_barrel", (0.45, 0.7, T_ROOF + 0.46), 0.022, 0.75, "X", M["black"], root, 10)
    box("mg_shield", (0.1, 0.7, T_ROOF + 0.42), (0.04, 0.42, 0.28), D, root, 0.005)
    box("sight", (0.35, -0.55, T_ROOF + 0.14), (0.42, 0.34, 0.28), O, root, 0.015)
    box("sight_glass", (0.565, -0.55, T_ROOF + 0.17), (0.01, 0.26, 0.12), M["glass"], root, 0.0)
    cyl("loader_hatch", (-0.55, -0.55, T_ROOF + 0.03), 0.3, 0.05, "Z", D, root, 28)
    box("wind_sensor", (-1.3, -0.3, T_ROOF + 0.15), (0.05, 0.05, 0.3), M["black"], root, 0.0)
    tube_between("antenna", (-1.4, -0.9, T_ROOF), (-1.5, -0.9, T_ROOF + 1.5), 0.012, M["black"], root, 6)
    # grab rails on the turret sides
    for s in (-1, 1):
        tube_between(f"grab{s}", (0.2, s * 1.48, T_BASE + 0.48), (-0.9, s * 1.42, T_BASE + 0.48), 0.015, M["black"], root, 6)

    # twin guns: wide mantlet, each barrel with a thermal sleeve in sections (the banded look), fume extractor, muzzle
    hull("mantlet", [(x, y, z) for x in (1.0, 1.55) for y in (-1.0, 1.0) for z in (GUN_Z - 0.3, GUN_Z + 0.26)], O, root, 0.03)
    box("mantlet_cover", (1.6, 0, GUN_Z - 0.02), (0.1, 1.9, 0.44), D, root, 0.02)
    for s in (-1, 1):
        y = s * GUN_Y
        x0 = 1.6
        cyl(f"collar{s}", (x0 + 0.14, y, GUN_Z), 0.17, 0.26, "X", D, root, 24)
        cyl(f"sleeve_a{s}", (x0 + 0.95, y, GUN_Z), 0.115, 1.4, "X", O, root, 24, radius2=0.105)
        cyl(f"fume{s}", (x0 + 2.05, y, GUN_Z), 0.15, 0.62, "X", O, root, 28)
        cyl(f"fume_in{s}", (x0 + 1.69, y, GUN_Z), 0.105, 0.1, "X", O, root, 24, radius2=0.15)
        cyl(f"fume_out{s}", (x0 + 2.41, y, GUN_Z), 0.15, 0.1, "X", O, root, 24, radius2=0.1)
        cyl(f"sleeve_b{s}", (x0 + 3.93, y, GUN_Z), 0.1, 2.94, "X", O, root, 24, radius2=0.09)
        for k, bx in enumerate((x0 + 0.5, x0 + 1.25, x0 + 2.75, x0 + 3.4, x0 + 4.1)):
            cyl(f"band{s}{k}", (bx, y, GUN_Z), 0.125 - k * 0.006, 0.06, "X", D, root, 24)
        cyl(f"muzzle{s}", (x0 + GUN_LEN - 0.12, y, GUN_Z), 0.105, 0.22, "X", D, root, 24)
        cyl(f"bore{s}", (x0 + GUN_LEN - 0.005, y, GUN_Z), 0.065, 0.01, "X", M["bore"], root, 18)
    # round badge plate on the mantlet (the photos carry an insignia there); plain, no national marking
    cyl("badge", (1.66, 0, GUN_Z + 0.08), 0.13, 0.02, "X", M["olive_light"], root, 24)


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
    tmp = os.path.join(os.environ.get("TEMP", HERE), f"twin-{FACTION}-{os.path.basename(path)}.tmp.png")
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
        print(f"[twin-{FACTION}] {os.path.basename(path)} {i + 1}/{len(cols)}", flush=True)
    img = bpy.data.images.new(os.path.basename(path), OUT * len(cols), OUT, alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    os.remove(tmp)
    print(f"[twin-{FACTION}] wrote {path}", flush=True)


def show(objs, on):
    for o in objs:
        o.hide_render = not on


def mask_mode(sc, floor, team):
    """Faction mask pass: only the TEAM-material parts show; everything else cuts them out (holdout), no shadow."""
    floor.hide_render = True
    for o in sc.objects:
        if o.type == "MESH" and o.name != "Floor":
            o.is_holdout = not any(s.material is team for s in o.material_slots)


def main():
    sc, floor = setup(OUT * SS, SAMPLES)
    M = mats()
    rig = node("Rig", (0, 0, 0), None)
    rig.scale = (1, 1, HEIGHT_SCALE)
    body = node("Body", (0, 0, 0), rig)
    before = set(sc.objects)
    build_tracks(body, M)
    build_hull(body, M)
    hull_objs = [o for o in sc.objects if o not in before]
    tur = node("Turret", (0, 0, 0), rig)
    before = set(sc.objects)
    build_turret(tur, M)
    tur_objs = [o for o in sc.objects if o not in before]
    smooth([o for o in sc.objects if o.type == "MESH" and o.name != "Floor"])
    if SIDE:
        sc.render.resolution_x = sc.render.resolution_y = 1024
        cam = camera(sc, 12.0, pivot=(48, 52))
        rig.rotation_euler = (0, 0, model_yaw(28))
        sc.render.filepath = os.path.join(SPRITES, f"tank-twin-{FACTION}-check-34.png")
        bpy.ops.render.render(write_still=True)
        cam.rotation_euler = (math.radians(90), 0, 0)
        cam.location = (1.0, -60, 1.3 * HEIGHT_SCALE)
        rig.rotation_euler = (0, 0, 0)
        sc.render.filepath = os.path.join(SPRITES, f"tank-twin-{FACTION}-check-side.png")
        bpy.ops.render.render(write_still=True)
        return
    camera(sc, CELL / PX_PER_M)
    if PREVIEW:
        shoot(sc, rig, os.path.join(SPRITES, f"tank-twin-{FACTION}-preview.png"), (4, 12, 20, 28))
        return
    # neutral hull and turret sheets + their faction masks (the game tints the masks with the owner's colour)
    show(tur_objs, False)
    shoot(sc, rig, os.path.join(SPRITES, "tank-twin-hull.png"), range(DIRS))
    show(tur_objs, True)
    show(hull_objs, False)
    floor.hide_render = True
    shoot(sc, rig, os.path.join(SPRITES, "tank-twin-turret.png"), range(DIRS))
    mask_mode(sc, floor, M["team"])
    shoot(sc, rig, os.path.join(SPRITES, "tank-twin-turret-team.png"), range(DIRS))
    show(tur_objs, False)
    show(hull_objs, True)
    shoot(sc, rig, os.path.join(SPRITES, "tank-twin-hull-team.png"), range(DIRS))

main()

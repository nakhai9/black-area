"""
Twins Shots Tank (Japan's holder). Original design from the user's references: a JGSDF Type 90 hull and running gear
(long, very shallow upper glacis, big angular front mudguard boxes, flat bolted side skirts, six road wheels and a
rear sprocket, louvred engine deck) under a flat-sided, flat-roofed Type 90-style turret that carries two 120 mm guns
side by side on one mantlet. The guns elevate together to GUN_UP (50 degrees on screen) to engage helicopters.
Paint: very dark green-black. Self-contained Blender model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/twintank_render.py -- [<faction>] [SAMPLES] [--preview] [--side]

    <faction>  usa | russia | china | europe | islamic   (default: neutral grey team parts + -team masks)
    --preview  row 0: 4 facings guns level, row 1: guns raised -> tank-twin-<faction>-preview.png
    --side     large 3/4 + side-on check images             -> tank-twin-<faction>-check-*.png

Dimensions (metres) [Unverified, public Type 90 figures]: hull 7.5 long, 3.4 wide over the skirts, 2.33 to the turret
roof, 0.45 ground clearance. Guns 5.0 m from the trunnions.
Faction colour: a band along each turret side and a line along each side skirt.

Sheets: 32 columns (ART_GUIDE 3: column 0 = nose straight up the screen, clockwise), 96 px layout cells stored at
384 px, the ground point under the turret ring at PIVOT; tanks' px per metre (PX_PER_M), HEIGHT_SCALE 1.6.
    tank-twin-hull.png / -hull-team.png      1 row: hull + its soft shadow
    tank-twin-turret.png / -turret-team.png  2 rows: row 0 guns level, row 1 guns raised (anti-helicopter)
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

RING_X = 0.6  # turret ring centre ahead of the hull middle; the model origin sits on it
FRONT, REAR = 3.75 - RING_X, -3.75 - RING_X
TRACK_W, TRACK_Y = 0.6, 1.4
WHEEL_R, WHEEL_Z = 0.33, 0.36
WHEELS_X = [2.3 - RING_X - i * 0.84 for i in range(6)]
IDLER = (3.15 - RING_X, 0.58, 0.29)
SPROCKET = (-3.4 - RING_X, 0.62, 0.33)
RETURNS = [1.85 - RING_X, 0.15 - RING_X, -1.55 - RING_X]
DECK = 1.5  # hull roof
SKIRT = 1.7  # half width over the side skirts
T_BASE, T_ROOF = DECK, 2.33
TRUNNION = (1.25, 0.0, 1.93)
GUN_Y = 0.42
GUN_UP = 50  # degrees, as seen in the sprite (the model is drawn HEIGHT_SCALE tall)

PAL = dict(
    paint="#262b22",
    paint_dark="#1a1e17",
    paint_light="#343a2d",
    black="#141513",
    track="#2a2926",
    rubber="#1c1c1a",
    steel="#5f625c",
    glass="#2b3540",
    lamp="#d9dcd2",
    amber="#c9861c",
    red="#8c1c16",
    mesh="#161815",
    bore="#0a0a0a",
    canvas="#3e3f2f",
)


def mats():
    m = {k: mat(k, v, rough=0.68) for k, v in PAL.items()}
    m["track"] = mat("track", PAL["track"], rough=0.55, metal=0.5)
    m["rubber"] = mat("rubber", PAL["rubber"], rough=0.9, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    m["lamp"] = mat("lamp", PAL["lamp"], rough=0.1, grime=False)
    m["red"] = mat("red", PAL["red"], rough=0.25, grime=False)
    m["amber"] = mat("amber", PAL["amber"], rough=0.2, grime=False)
    m["canvas"] = mat("canvas", PAL["canvas"], rough=0.9)
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
    cyl(f"{name}_rim", (x, y + s * 0.26, z), r * 0.84, 0.03, "Y", M["paint"], root, 28)
    if dish:
        cyl(f"{name}_dish", (x, y + s * 0.28, z), r * 0.6, 0.04, "Y", M["paint_dark"], root, 24)
        for k in range(8):
            a = k / 8 * 2 * math.pi
            cyl(f"{name}_rib{k}", (x + 0.17 * r / 0.34 * math.cos(a), y + s * 0.3, z + 0.17 * r / 0.34 * math.sin(a)), 0.025, 0.03, "Y", M["paint_dark"], root, 6)
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
        cyl(f"spr{s}", (x, s * TRACK_Y, z), r * 0.9, 0.4, "Y", M["paint_dark"], root, 28)
        for k in range(12):
            t = box(f"tooth{s}_{k}", (r * 0.95, 0, 0), (0.08, 0.34, 0.07), M["paint_dark"], root, 0.005)
            t.location = (x, s * TRACK_Y, z)
            t.rotation_euler = (0, -k / 12 * 2 * math.pi, 0)
        for x in RETURNS:
            cyl(f"ret{s}{x:.1f}", (x, s * (TRACK_Y - 0.05), 0.97), 0.08, 0.2, "Y", M["rubber"], root, 16)


# ------------------------------------------------------------------ hull (Type 90 style)


def build_hull(root, M):
    O, D, L = M["paint"], M["paint_dark"], M["paint_light"]
    lw = 1.12
    # lower hull: flat sides, short lower glacis
    hull("lower_hull", [(x, s * lw, z) for s in (-1, 1) for (x, z) in ((FRONT - 0.6, 0.45), (FRONT, 0.92), (REAR + 0.2, 0.45), (REAR, 0.9), (FRONT, 1.12), (REAR, 1.12))], O, root, 0.02)
    # upper hull: the long, very shallow upper glacis of the Type 90 running back to a flat deck
    hull("upper_hull", [(x, s * y, z) for s in (-1, 1) for (x, y, z) in ((FRONT, 1.05, 0.95), (FRONT - 1.7, 1.15, DECK), (REAR + 0.12, 1.15, DECK), (REAR, 1.15, DECK - 0.22), (REAR, 1.15, 0.92), (FRONT, 1.05, 0.9))], O, root, 0.02)
    # fenders / sponsons over the tracks, flat-topped, square-edged
    for s in (-1, 1):
        hull(f"fender{s}", [(x, s * y, z) for x in (FRONT - 0.75, REAR + 0.05) for y in (1.1, SKIRT) for z in (DECK - 0.08, DECK - 0.02)], O, root, 0.01)
        # the big angular front mudguard boxes (sloping top, square face) seen on every photo
        hull(f"mudguard{s}", [(x, s * y, z) for y in (1.08, SKIRT) for (x, z) in ((FRONT - 0.02, 1.22), (FRONT - 0.02, 0.92), (FRONT - 0.78, DECK - 0.02), (FRONT - 0.78, 0.95))], O, root, 0.02)
        box(f"mudguard_face{s}", (FRONT + 0.005, s * (1.08 + SKIRT) / 2, 1.07), (0.02, SKIRT - 1.16, 0.24), D, root, 0.0)
        # headlight cluster on the mudguard top with a wire guard, amber indicator
        cyl(f"headlamp{s}", (FRONT - 0.32, s * 1.62, 1.36), 0.075, 0.1, "X", M["lamp"], root, 14)
        cyl(f"headlamp_rim{s}", (FRONT - 0.38, s * 1.62, 1.36), 0.09, 0.06, "X", D, root, 14)
        tube_between(f"lamp_guard{s}", (FRONT - 0.45, s * 1.5, 1.42), (FRONT - 0.22, s * 1.62, 1.48), 0.012, M["black"], root, 6)
        box(f"indicator{s}", (FRONT - 0.3, s * 1.38, 1.33), (0.05, 0.09, 0.07), M["amber"], root, 0.0)
        # side skirt: vertical plate with panel seams and bolt rows, rubber flap below
        y = s * SKIRT
        hull(f"skirt{s}", [(x, y + s * dy, z) for (x, z) in ((FRONT - 0.78, DECK - 0.04), (REAR + 0.1, DECK - 0.04), (REAR + 0.1, 0.92), (FRONT - 0.95, 0.88)) for dy in (-0.05, 0.0)], O, root, 0.008)
        hull(f"skirt_rubber{s}", [(x, y + s * dy, z) for x in (FRONT - 0.95, REAR + 0.1) for z in (0.74, 0.9) for dy in (-0.04, -0.01)], M["rubber"], root, 0.0)
        n = 7
        for k in range(n + 1):
            x = FRONT - 0.85 - k * (FRONT - 0.95 - REAR) / n
            box(f"skirt_seam{s}{k}", (x, y + s * 0.006, 1.18), (0.02, 0.012, 0.56), D, root, 0.0)
        for k in range(28):
            x = FRONT - 0.95 - k * (FRONT - 1.05 - REAR) / 27
            cyl(f"skirt_bolt{s}{k}", (x, y + s * 0.012, DECK - 0.11), 0.018, 0.02, "Y", L, root, 6)
        # faction line along the skirt
        hull(f"team_skirt{s}", [(x, y + s * dy, z) for x in (FRONT - 0.95, REAR + 0.18) for z in (1.22, 1.32) for dy in (0.004, 0.018)], M["team"], root, 0.0)
        # stowage boxes on the rear fenders
        for k, x in enumerate((-1.75 - RING_X, -2.55 - RING_X)):
            box(f"fender_box{s}{k}", (x, s * (SKIRT - 0.3), DECK + 0.14), (0.72, 0.48, 0.3), O, root, 0.012)
            box(f"fender_lid{s}{k}", (x, s * (SKIRT - 0.3), DECK + 0.3), (0.7, 0.46, 0.025), D, root, 0.004)
            box(f"fender_latch{s}{k}", (x, s * (SKIRT - 0.05), DECK + 0.2), (0.07, 0.02, 0.06), M["steel"], root, 0.0)
        # tow hooks and rear lights
        cyl(f"tow_f{s}", (FRONT + 0.03, s * 0.75, 0.9), 0.07, 0.09, "X", M["steel"], root, 10)
        cyl(f"tow_r{s}", (REAR - 0.03, s * 0.9, 0.98), 0.07, 0.09, "X", M["steel"], root, 10)
        box(f"taillight{s}", (REAR - 0.02, s * 1.45, DECK - 0.1), (0.04, 0.16, 0.08), M["red"], root, 0.004)
        # mirror post folded on the glacis corner
        tube_between(f"mirror_post{s}", (FRONT - 1.05, s * 1.0, DECK - 0.15), (FRONT - 1.05, s * 1.0, DECK + 0.15), 0.015, M["black"], root, 6)
    # glacis detail: driver's hatch (left), periscopes, a lifting eye pair, panel line across
    box("driver_hatch", (FRONT - 1.55, 0.55, DECK + 0.015), (0.5, 0.55, 0.04), D, root, 0.008)
    for k in range(3):
        box(f"driver_peri{k}", (FRONT - 1.25, 0.38 + k * 0.17, DECK + 0.03), (0.07, 0.12, 0.06), M["glass"], root, 0.0)
    for s in (-1, 1):
        box(f"lift_eye{s}", (FRONT - 0.5, s * 0.9, 1.06), (0.08, 0.03, 0.08), M["steel"], root, 0.0)
    a = math.atan2(DECK - 0.95, 1.7)
    rbox("glacis_seam", (FRONT - 0.85, 0, 0.95 + (DECK - 0.95) * 0.5 + 0.01), (0.02, 2.2, 0.012), D, root, 0.0, ry=-a)
    # engine deck: large louvred grilles, access panels, exhaust grille on the rear plate
    for k in range(3):
        x = -1.35 - RING_X - k * 0.82
        box(f"deck_grille{k}", (x, 0, DECK + 0.012), (0.72, 2.0, 0.02), M["mesh"], root, 0.0)
        for j in range(10):
            box(f"deck_slat{k}{j}", (x, -0.9 + j * 0.2, DECK + 0.03), (0.7, 0.05, 0.02), D, root, 0.0)
    for k, x in enumerate((-0.75 - RING_X, -3.75 - RING_X)):
        box(f"deck_panel{k}", (x, 0, DECK + 0.015), (0.42, 2.1, 0.03), D, root, 0.006)
    box("rear_grille", (REAR - 0.012, 0, 1.25), (0.02, 1.9, 0.38), M["mesh"], root, 0.0)
    for j in range(6):
        box(f"rear_slat{j}", (REAR - 0.03, 0, 1.1 + j * 0.06), (0.02, 1.9, 0.02), D, root, 0.0)
    cyl("ant_base", (-2.2 - RING_X, -1.25, DECK + 0.05), 0.05, 0.1, "Z", M["black"], root, 10)


# ------------------------------------------------------------------ turret (origin = ring centre)


def build_turret(root, M):
    O, D, L = M["paint"], M["paint_dark"], M["paint_light"]
    # flat-sided, flat-roofed welded turret: square front cheeks with a chamfered outer corner, long bustle
    plan = ((1.6, 0.82), (1.6, 1.25), (1.2, 1.6), (-1.1, 1.62), (-2.15, 1.5), (-2.35, 1.2))
    pts = []
    for (x, y) in plan:
        for s in (-1, 1):
            pts += [(x, s * y * 0.97, T_BASE + 0.02), (x, s * y, T_ROOF - 0.06), (x - 0.04, s * (y - 0.05), T_ROOF)]
    hull("turret", pts, O, root, 0.02)
    # front cheek armour faces (slightly proud plates) either side of the twin mantlet
    for s in (-1, 1):
        box(f"cheek_face{s}", (1.61, s * 1.04, (T_BASE + T_ROOF) / 2), (0.03, 0.4, T_ROOF - T_BASE - 0.14), L, root, 0.006)
        for k in range(3):
            cyl(f"cheek_bolt{s}{k}", (1.635, s * (0.9 + k * 0.14), T_ROOF - 0.16), 0.02, 0.02, "X", D, root, 6)
    # side panel lines, side stowage boxes and grab rails
    for s in (-1, 1):
        for x in (0.6, -0.4, -1.4):
            box(f"side_seam{s}{x}", (x, s * 1.625, (T_BASE + T_ROOF) / 2), (0.02, 0.01, T_ROOF - T_BASE - 0.12), D, root, 0.0)
        box(f"side_box{s}", (-0.9, s * 1.72, T_BASE + 0.42), (1.1, 0.18, 0.36), O, root, 0.012)
        box(f"side_box_lid{s}", (-0.9, s * 1.72, T_BASE + 0.61), (1.08, 0.17, 0.025), D, root, 0.004)
        tube_between(f"grab{s}", (0.7, s * 1.66, T_ROOF - 0.12), (-0.3, s * 1.66, T_ROOF - 0.12), 0.015, M["black"], root, 6)
        # faction band along each turret side
        hull(f"team_turret{s}", [(x, s * (y + dy), z) for (x, y) in ((1.15, 1.6), (-2.1, 1.49)) for z in (T_ROOF - 0.26, T_ROOF - 0.14) for dy in (0.004, 0.02)], M["team"], root, 0.0)
        # smoke grenade dischargers: a block of three tubes on each rear side, firing forward and up
        box(f"smoke_base{s}", (-1.55, s * 1.62, T_ROOF - 0.02), (0.38, 0.22, 0.08), D, root, 0.006)
        for k in range(3):
            p0 = (-1.68 + k * 0.13, s * 1.62, T_ROOF + 0.01)
            tube_between(f"smoke{s}{k}", p0, (p0[0] + 0.2, p0[1] + s * 0.04, p0[2] + 0.22), 0.05, D, root, 12)
    # bustle basket: rails round the rear with a stowed load inside
    for s in (-1, 1):
        tube_between(f"rack_side{s}", (-2.1, s * 1.55, T_ROOF + 0.18), (-2.55, s * 1.3, T_ROOF + 0.18), 0.018, M["black"], root, 6)
    tube_between("rack_back", (-2.55, -1.3, T_ROOF + 0.18), (-2.55, 1.3, T_ROOF + 0.18), 0.018, M["black"], root, 6)
    for y in (-1.3, -0.45, 0.45, 1.3):
        tube_between(f"rack_post{y}", (-2.5, y, T_BASE + 0.5), (-2.55, y, T_ROOF + 0.18), 0.015, M["black"], root, 6)
    box("rack_load", (-2.3, 0, T_ROOF + 0.06), (0.4, 2.2, 0.2), M["canvas"], root, 0.03)
    # roof: gunner's sight box (left front), commander's panoramic sight on a pedestal (right), hatches, 12.7 mm MG
    box("gun_sight", (1.0, 0.95, T_ROOF + 0.17), (0.6, 0.42, 0.34), O, root, 0.015)
    box("gun_sight_door", (1.31, 0.95, T_ROOF + 0.2), (0.02, 0.32, 0.18), M["glass"], root, 0.0)
    cyl("pano_post", (0.55, -0.95, T_ROOF + 0.18), 0.12, 0.36, "Z", D, root, 16)
    box("pano_head", (0.6, -0.95, T_ROOF + 0.44), (0.38, 0.32, 0.24), O, root, 0.02)
    box("pano_glass", (0.795, -0.95, T_ROOF + 0.45), (0.01, 0.24, 0.12), M["glass"], root, 0.0)
    cyl("cdr_hatch", (-0.35, -0.8, T_ROOF + 0.04), 0.33, 0.07, "Z", D, root, 28)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        box(f"cdr_peri{k}", (-0.35 + 0.36 * math.cos(a), -0.8 + 0.36 * math.sin(a), T_ROOF + 0.06), (0.07, 0.07, 0.07), M["glass"], root, 0.0)
    cyl("ldr_hatch", (-0.45, 0.75, T_ROOF + 0.035), 0.32, 0.06, "Z", D, root, 28)
    cyl("mg_ring", (-0.45, 0.75, T_ROOF + 0.08), 0.36, 0.03, "Z", M["black"], root, 28)
    tube_between("mg_post", (-0.2, 0.75, T_ROOF + 0.08), (-0.2, 0.75, T_ROOF + 0.4), 0.03, M["black"], root, 8)
    box("mg_body", (-0.1, 0.75, T_ROOF + 0.43), (0.7, 0.12, 0.13), M["black"], root, 0.005)
    cyl("mg_barrel", (0.6, 0.75, T_ROOF + 0.44), 0.025, 0.8, "X", M["black"], root, 10)
    box("mg_ammo", (-0.12, 0.88, T_ROOF + 0.38), (0.22, 0.12, 0.14), D, root, 0.004)
    box("rear_hatch", (-1.55, 0, T_ROOF + 0.015), (0.5, 0.7, 0.03), D, root, 0.006)
    # wind sensor and two whip antennas on the rear roof corners
    tube_between("wind_sensor", (-1.85, 0.2, T_ROOF), (-1.85, 0.2, T_ROOF + 0.4), 0.02, M["black"], root, 6)
    box("wind_head", (-1.85, 0.2, T_ROOF + 0.42), (0.08, 0.08, 0.05), M["black"], root, 0.0)
    for s in (-1, 1):
        cyl(f"ant_base{s}", (-1.95, s * 1.25, T_ROOF + 0.05), 0.05, 0.1, "Z", M["black"], root, 10)
        tube_between(f"antenna{s}", (-1.95, s * 1.25, T_ROOF + 0.1), (-2.05, s * 1.25, T_ROOF + 1.6), 0.012, M["black"], root, 6)

    # twin mantlet: one wide armoured block between the cheeks, carrying both guns (fixed part)
    hull("mantlet_fixed", [(x, y, z) for x in (1.25, 1.6) for y in (-0.82, 0.82) for z in (T_BASE + 0.08, T_ROOF - 0.04)], D, root, 0.015)


def build_guns(root, M):
    """The elevating mass, built round the trunnion (local origin): mantlet, two parallel 120 mm guns."""
    O, D = M["paint"], M["paint_dark"]
    hull("mantlet", [(x, y, z) for x in (0.0, 0.55) for y in (-0.78, 0.78) for z in (-0.3, 0.28)], O, root, 0.03)
    box("mantlet_front", (0.57, 0, -0.01), (0.06, 1.5, 0.5), D, root, 0.02)
    for s in (-1, 1):
        y = s * GUN_Y
        cyl(f"collar{s}", (0.7, y, 0), 0.17, 0.28, "X", D, root, 24)
        cyl(f"sleeve_a{s}", (1.6, y, 0), 0.115, 1.6, "X", O, root, 24, radius2=0.108)
        cyl(f"sleeve_b{s}", (3.35, y, 0), 0.105, 1.9, "X", O, root, 24, radius2=0.098)
        for k, bx in enumerate((0.95, 1.65, 2.4, 3.1, 3.8)):
            cyl(f"band{s}{k}", (bx, y, 0), 0.122 - k * 0.004, 0.05, "X", D, root, 24)
        cyl(f"tube{s}", (4.6, y, 0), 0.09, 0.6, "X", O, root, 24, radius2=0.085)
        cyl(f"mrs{s}", (4.88, y + s * 0.0, 0.11), 0.03, 0.08, "X", D, root, 10)
        cyl(f"muzzle{s}", (4.95, y, 0), 0.1, 0.1, "X", D, root, 24)
        cyl(f"bore{s}", (5.005, y, 0), 0.06, 0.01, "X", M["bore"], root, 18)
    # coaxial MG port and a plain round plate on the mantlet centre (no national marking)
    cyl("coax", (0.6, 0, -0.18), 0.04, 0.12, "X", M["black"], root, 10)
    cyl("badge", (0.61, 0, 0.1), 0.11, 0.02, "X", M["paint_light"], root, 24)


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


def shoot(sc, rig, cols, label):
    """Renders the facings `cols` into one row (OUT px cells, SS-supersampled) and returns it as an array."""
    big = OUT * SS
    acc = np.zeros((OUT, OUT * len(cols), 4), np.float32)
    tmp = os.path.join(os.environ.get("TEMP", HERE), f"twin-{FACTION}-{label}.tmp.png")
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
        print(f"[twin-{FACTION}] {label} {i + 1}/{len(cols)}", flush=True)
    os.remove(tmp)
    return acc


def save(rows, path):
    """Stacks the rows top to bottom (Blender images are stored bottom-up) and writes the PNG."""
    acc = np.concatenate(list(reversed(rows)), axis=0)
    img = bpy.data.images.new(os.path.basename(path), acc.shape[1], acc.shape[0], alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print(f"[twin-{FACTION}] wrote {path}", flush=True)


def raise_guns(guns, up):
    """Guns level or raised; the rig is drawn HEIGHT_SCALE tall, so the model angle is chosen to read GUN_UP on screen."""
    guns.rotation_euler = (0, -math.atan(math.tan(math.radians(GUN_UP)) / HEIGHT_SCALE) if up else 0, 0)


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
    guns = node("Guns", TRUNNION, tur)
    build_guns(guns, M)
    tur_objs = [o for o in sc.objects if o not in before]
    smooth([o for o in sc.objects if o.type == "MESH" and o.name != "Floor"])
    if SIDE:
        sc.render.resolution_x = sc.render.resolution_y = 1024
        cam = camera(sc, 13.0, pivot=(48, 52))
        rig.rotation_euler = (0, 0, model_yaw(28))
        sc.render.filepath = os.path.join(SPRITES, f"tank-twin-{FACTION}-check-34.png")
        bpy.ops.render.render(write_still=True)
        cam.rotation_euler = (math.radians(90), 0, 0)
        cam.location = (0.5, -60, 1.6 * HEIGHT_SCALE)
        rig.rotation_euler = (0, 0, 0)
        raise_guns(guns, True)
        sc.render.filepath = os.path.join(SPRITES, f"tank-twin-{FACTION}-check-side.png")
        bpy.ops.render.render(write_still=True)
        return
    camera(sc, CELL / PX_PER_M)
    if PREVIEW:
        level = shoot(sc, rig, (4, 12, 20, 28), "preview")
        raise_guns(guns, True)
        save([level, shoot(sc, rig, (4, 12, 20, 28), "preview-up")], os.path.join(SPRITES, f"tank-twin-{FACTION}-preview.png"))
        return
    # neutral hull and turret sheets + their faction masks (the game tints the masks with the owner's colour)
    show(tur_objs, False)
    save([shoot(sc, rig, range(DIRS), "hull")], os.path.join(SPRITES, "tank-twin-hull.png"))
    show(tur_objs, True)
    show(hull_objs, False)
    floor.hide_render = True
    raise_guns(guns, False)
    level = shoot(sc, rig, range(DIRS), "turret")
    raise_guns(guns, True)
    save([level, shoot(sc, rig, range(DIRS), "turret-up")], os.path.join(SPRITES, "tank-twin-turret.png"))
    mask_mode(sc, floor, M["team"])
    raise_guns(guns, False)
    level = shoot(sc, rig, range(DIRS), "turret-team")
    raise_guns(guns, True)
    save([level, shoot(sc, rig, range(DIRS), "turret-team-up")], os.path.join(SPRITES, "tank-twin-turret-team.png"))
    show(tur_objs, False)
    show(hull_objs, True)
    save([shoot(sc, rig, range(DIRS), "hull-team")], os.path.join(SPRITES, "tank-twin-hull-team.png"))


main()

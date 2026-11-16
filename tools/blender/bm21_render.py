"""
BM-21 "Grad" 122 mm rocket launcher on the Ural-4320 6x6 chassis: self-contained Blender model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/bm21_render.py -- <faction> [SAMPLES] [--preview] [--side]

    <faction>  usa | russia | china | europe | islamic   (team colour from kit.py TEAM)
    --preview  4 facings only (NE, SE, SW, NW)               -> bm21-<faction>-preview.png
    --module   the launcher module sheet (faction-free)     -> bm21-launcher.png
    --side     one large 3/4 + one large side-on check image -> bm21-<faction>-check-*.png (compare with the blueprint)

Built in REAL metres from the factory drawing (BM-21 / Ural-4320):
    length 7.366 m (front overhang 1.276, wheelbase 3.525 + 1.400, rear overhang 1.165), width 2.40 m (2.674 over the
    mirrors), cab roof 2.60 m, travel height 3.09 m, track 2.00 m, tyres 1100 x 400-533 (r 0.55 m).
    Launcher: 40 tubes, 4 rows x 10, 3.0 m long, 122 mm bore; elevated LAUNCH_DEG = 30 deg relative to the hull
    (the 1.6 HEIGHT_SCALE would steepen it, so the model angle is pre-compensated: what the eye sees is 30 deg).
    Paint: Russian light olive green (Mr.Hobby H303), black tyres; faction colour on the cab doors and the side line.

Modular (as kamaz_render.py): the Ural-4320 truck and the launcher are separate builders and separate sheets, so the
truck can carry other modules later:
    CHASSIS  frame, running gear, bonnet, cab, spare wheel, boxes, fenders (faction colour) -> ural4320-<faction>-chassis.png
    MODULE   turntable, saddle, jacks, 40-tube pack (no faction colour)                     -> bm21-launcher.png
The game draws the chassis, then the module; the module is rendered with the truck as a HOLDOUT so the overlap is right.

Sheet: 32 columns (ART_GUIDE 3: column 0 = nose straight up the screen, clockwise), one row, 64 px layout cells stored
at 256 px, the vehicle with its soft shadow; ground centre at PIVOT; tanks' px per metre (PX_PER_M).
Axes: +X front (u), +Y left (v), +Z up (z), metres.
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
FACTION = next((a for a in ARGS if a in TEAM), "russia")
PREVIEW = "--preview" in ARGS
SIDE = "--side" in ARGS
MODULE = "--module" in ARGS  # render the launcher module sheet instead of the truck
SAMPLES = next((int(a) for a in ARGS if a.isdigit()), 32)

CELL, DIRS, SS, OUT = 64, 32, 2, 256
PIVOT = (32, 41)  # ground centre in the 64 px layout cell (room above for the raised launcher)
PX_PER_M = 42 / 7.77  # same sheet px per metre as the tank sheets (t90m_sheet.py)
HEIGHT_SCALE = 1.6  # RA2-style chunky look, as the tanks and trucks (ART_GUIDE 5)

# ---- real dimensions (m), Ural-4320 / BM-21 drawing ----
LENGTH, WIDTH = 7.366, 2.40
FRONT, REAR = LENGTH / 2, -LENGTH / 2
AX = (FRONT - 1.276, FRONT - 1.276 - 3.525, FRONT - 1.276 - 3.525 - 1.40)  # 2.407, -1.118, -2.518
TRACK = 2.00
TYRE_R, TYRE_W = 0.55, 0.40
FRAME_Z = (0.88, 1.12)
CAB_X = (1.92, 0.55)  # cab front (windscreen base) / back wall
CAB_TOP = 2.60
HOOD_X = 3.42  # grille face
LAUNCH_DEG = 30.0  # seen angle of the tube pack over the hull
PACK_DEG = math.degrees(math.atan(math.tan(math.radians(LAUNCH_DEG)) / HEIGHT_SCALE))  # model angle (z is stretched)
TURRET_X = -1.62  # turntable centre
TRUNNION = (-2.78, 2.02)  # elevation axis (x, z): the pack's low, rear end (the muzzles rise forward over the cab)
TUBE_LEN, TUBE_R, PITCH, ROWS, COLS = 3.0, 0.068, 0.158, 4, 10

PAL = dict(
    olive="#56633a",  # H303 light green, weathered
    olive_dark="#434e2c",
    black="#1b1b19",
    tyre="#202020",
    steel="#5d5d58",
    glass="#2a3540",
    lamp="#d9dcd2",
    amber="#c9781e",
    red="#8c1c16",
    plate="#d8d8cc",
    bore="#0c0c0c",
)


def mats():
    m = {k: mat(k, v, rough=0.66) for k, v in PAL.items()}
    m["tyre"] = mat("tyre", PAL["tyre"], rough=0.92, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    m["lamp"] = mat("lamp", PAL["lamp"], rough=0.1, grime=False)
    m["amber"] = mat("amber", PAL["amber"], rough=0.2, grime=False)
    m["red"] = mat("red", PAL["red"], rough=0.25, grime=False)
    m["bore"] = mat("bore", PAL["bore"], rough=0.9, grime=False)
    m["team"] = mat("team", TEAM[FACTION], rough=0.55)
    return m


# ------------------------------------------------------------------ running gear


def tyre(name, x, y, z, M, parent, side):
    """Ural off-road tyre: round carcass, directional chevron lugs, olive 8-hole disc rim, hub with the inflation valve."""
    cyl(f"{name}_tyre", (x, y, z), TYRE_R, TYRE_W, "Y", M["tyre"], parent, 40)
    cyl(f"{name}_wall", (x, y + side * TYRE_W * 0.47, z), TYRE_R * 0.92, 0.03, "Y", M["tyre"], parent, 40)
    for k in range(22):
        a = k / 22 * 2 * math.pi
        for s in (-1, 1):
            lug = box(f"{name}_lug{k}{s}", (TYRE_R + 0.012, s * TYRE_W * 0.24, 0), (0.05, TYRE_W * 0.4, 0.09), M["tyre"], parent, 0.008)
            lug.location = (x, y, z)
            lug.rotation_euler = (0, -a - s * 0.06, 0)
    rim_y = y + side * TYRE_W * 0.47
    cyl(f"{name}_rim", (x, rim_y, z), TYRE_R * 0.6, 0.05, "Y", M["olive"], parent, 32)
    cyl(f"{name}_dish", (x, rim_y + side * 0.03, z), TYRE_R * 0.42, 0.04, "Y", M["olive_dark"], parent, 24)
    for k in range(8):
        a = (k + 0.5) / 8 * 2 * math.pi
        cyl(f"{name}_hole{k}", (x + 0.24 * math.cos(a), rim_y + side * 0.02, z + 0.24 * math.sin(a)), 0.03, 0.055, "Y", M["black"], parent, 8)
    cyl(f"{name}_hub", (x, rim_y + side * 0.07, z), 0.1, 0.09, "Y", M["olive_dark"], parent, 16)
    cyl(f"{name}_cap", (x, rim_y + side * 0.12, z), 0.05, 0.03, "Y", M["steel"], parent, 10)


def build_chassis(root, M):
    zf0, zf1 = FRAME_Z
    for s in (-1, 1):
        box(f"rail{s}", ((REAR + 0.1 + FRONT - 0.2) / 2, s * 0.44, (zf0 + zf1) / 2), (FRONT - 0.3 - REAR, 0.1, zf1 - zf0), M["black"], root, 0.01)
    for i, x in enumerate((3.2, 1.5, 0.0, -1.6, -2.9, -3.55)):
        box(f"xmember{i}", (x, 0, (zf0 + zf1) / 2), (0.12, 0.88, 0.16), M["black"], root, 0.008)
    for i, x in enumerate(AX):
        z = TYRE_R
        tube_between(f"axle{i}", (x, -TRACK / 2 + 0.2, z), (x, TRACK / 2 - 0.2, z), 0.07, M["black"], root, 12)
        hull(f"diff{i}", [(x + dx, dy, z + dz) for dx in (-0.22, 0.22) for dy in (-0.2, 0.2) for dz in (-0.2, 0.18)], M["olive_dark"], root, 0.04)
        for s in (-1, 1):
            box(f"spring{i}{s}", (x, s * 0.5, z + 0.2), (1.2 if i == 0 else 0.95, 0.08, 0.1), M["black"], root, 0.01)
            tyre(f"wheel{i}{'L' if s > 0 else 'R'}", x, s * TRACK / 2, TYRE_R, M, root, s)
    # tandem balancer between the rear axles
    for s in (-1, 1):
        box(f"balancer{s}", ((AX[1] + AX[2]) / 2, s * 0.52, TYRE_R + 0.3), (0.5, 0.18, 0.3), M["olive_dark"], root, 0.03)
    for i in (0, 1):
        tube_between(f"shaft{i}", (AX[i] - 0.25, 0, TYRE_R + 0.05), (AX[i + 1] + 0.25, 0, TYRE_R + 0.05), 0.045, M["black"], root, 10)
    box("transfer_case", (0.3, 0, 0.78), (0.5, 0.5, 0.35), M["olive_dark"], root, 0.03)

    # under-cab equipment: fuel tank on the left, battery box on the right, both under the door steps
    cyl("fuel_tank", (0.9, 1.0, 0.92), 0.26, 1.0, "X", M["olive"], root, 24)
    for k, x in enumerate((0.5, 1.3)):
        box(f"fuel_strap{k}", (x, 1.0, 0.92), (0.04, 0.54, 0.55), M["black"], root, 0.005)
    box("battery_box", (0.9, -1.0, 0.94), (0.9, 0.4, 0.46), M["olive"], root, 0.02)
    box("battery_lid", (0.9, -1.0, 1.19), (0.92, 0.42, 0.04), M["olive_dark"], root, 0.01)

    # rear: bumper beam, pintle hook, tail lights, the two crank-down stabiliser legs, plate
    box("rear_beam", (REAR + 0.08, 0, 0.98), (0.16, 2.3, 0.16), M["olive_dark"], root, 0.012)
    cyl("pintle", (REAR - 0.02, 0, 0.92), 0.06, 0.18, "X", M["steel"], root, 12)
    box("rear_plate", (REAR + 0.0, -0.35, 0.82), (0.01, 0.36, 0.16), M["plate"], root, 0.0)
    for s in (-1, 1):
        box(f"taillight{s}", (REAR + 0.0, s * 0.95, 1.0), (0.05, 0.2, 0.09), M["red"], root, 0.008)
        tube_between(f"leg{s}", (REAR + 0.22, s * 0.95, 1.2), (REAR + 0.22, s * 0.95, 0.12), 0.05, M["olive_dark"], root, 12)
        cyl(f"leg_pad{s}", (REAR + 0.22, s * 0.95, 0.1), 0.13, 0.04, "Z", M["black"], root, 16)
        cyl(f"leg_crank{s}", (REAR + 0.22, s * 0.95, 1.28), 0.07, 0.1, "Z", M["steel"], root, 10)
        box(f"mudflap{s}", (AX[2] - TYRE_R - 0.12, s * TRACK / 2, 0.52), (0.02, 0.42, 0.55), M["black"], root, 0.005)

    build_front(root, M)
    build_cab(root, M)
    build_rear_deck(root, M)


# ------------------------------------------------------------------ bonnet and front wings (Ural long nose)


def build_front(root, M):
    # front bumper with tow hooks and the plate
    box("bumper", (FRONT - 0.09, 0, 0.9), (0.18, 2.35, 0.24), M["olive_dark"], root, 0.015)
    box("plate", (FRONT + 0.005, 0.0, 0.88), (0.01, 0.52, 0.12), M["plate"], root, 0.0)
    for s in (-1, 1):
        cyl(f"tow_hook{s}", (FRONT + 0.02, s * 0.62, 0.8), 0.05, 0.1, "X", M["steel"], root, 10)
    # grille: tall flat face with vertical slats and the name plate lettering (dark blocks)
    gx = HOOD_X
    box("grille_frame", (gx, 0, 1.38), (0.06, 0.92, 0.78), M["olive"], root, 0.015)
    for k in range(13):
        box(f"slat{k}", (gx + 0.035, -0.39 + k * 0.065, 1.33), (0.02, 0.025, 0.58), M["black"], root, 0.0)
    for k in range(4):
        box(f"letter{k}", (gx + 0.035, -0.15 + k * 0.1, 1.71), (0.01, 0.07, 0.06), M["olive_dark"], root, 0.0)
    # bonnet: narrow top, sides falling out to the wings, slight rise toward the windscreen
    hood = []
    for x, ztop in ((gx - 0.02, 1.78), (CAB_X[0] + 0.02, 1.9)):
        hood += [(x, s * 0.5, ztop) for s in (-1, 1)]
        hood += [(x, s * 0.62, ztop - 0.07) for s in (-1, 1)]
        hood += [(x, s * 0.66, 1.3) for s in (-1, 1)]
    hull("bonnet", hood, M["olive"], root, 0.05)
    # bonnet side louvres (the row of "C" vents) and the team line under them
    for s in (-1, 1):
        for k in range(7):
            x = 3.2 - k * 0.11
            box(f"louvre{s}{k}", (x, s * 0.665, 1.6), (0.06, 0.02, 0.1), M["black"], root, 0.006)
    # wings: big rounded fenders over the front wheels, running board into the cab step
    for s in (-1, 1):
        # solid flared wing in vertical slices: flat top that rolls down to the bumper, cut by the wheel arch below
        ra, x0, x1 = TYRE_R + 0.13, AX[0] - 0.95, AX[0] + 1.02
        def ztop(x):
            d = x - AX[0]
            return 1.5 - 1.75 * max(d - 0.42, 0) ** 2

        def zbot(x):
            d = x - AX[0]
            return max(TYRE_R + math.sqrt(max(ra * ra - d * d, 0.0)), 0.86)

        n = 16
        for i in range(n):
            xa, xb2 = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
            pts = [(x, s * yy, z) for x in (xa, xb2) for yy in (0.64, 1.2) for z in (ztop(x), zbot(x))]
            hull(f"wing{s}_{i}", pts, M["olive"], root, 0.0)
        hull(f"team_line_wing{s}", [(x, s * 1.207, z) for x in (AX[0] - 0.95, AX[0] + 0.4) for z in (1.3, 1.42)], M["team"], root, 0.0)
        box(f"wing_lip{s}", (AX[0], s * 1.205, 1.48), (1.0, 0.02, 0.05), M["olive_dark"], root, 0.004)
        # wing front face with the headlamp and indicator
        cyl(f"headlamp{s}", (AX[0] + 0.62, s * 0.92, 1.3), 0.11, 0.08, "X", M["lamp"], root, 20)
        cyl(f"headlamp_rim{s}", (AX[0] + 0.58, s * 0.92, 1.3), 0.13, 0.06, "X", M["olive_dark"], root, 20)
        box(f"indicator{s}", (AX[0] + 0.55, s * 1.1, 1.42), (0.04, 0.08, 0.06), M["amber"], root, 0.005)
        box(f"wing_skirt{s}", (AX[0] - 0.95, s * 0.95, 0.98), (0.1, 0.5, 0.25), M["olive_dark"], root, 0.01)


# ------------------------------------------------------------------ cab


def build_cab(root, M):
    """Ural-4320 cab: upright two-pane windscreen, doors with drop glass, flat roof with a lip, small rear window."""
    cab = node("Cab", (0, 0, 0), root)
    xf, xb = CAB_X
    zb, zt, hw = 1.12, CAB_TOP, 1.12
    hull(
        "cab_shell",
        [(xf, s * hw, zb) for s in (-1, 1)]
        + [(xf, s * hw, 1.95) for s in (-1, 1)]
        + [(xf - 0.16, s * (hw - 0.03), zt - 0.03) for s in (-1, 1)]
        + [(xf - 0.2, s * (hw - 0.05), zt) for s in (-1, 1)]
        + [(xb + 0.04, s * (hw - 0.05), zt) for s in (-1, 1)]
        + [(xb, s * hw, zt - 0.05) for s in (-1, 1)]
        + [(xb, s * hw, zb) for s in (-1, 1)],
        M["olive"],
        cab,
        0.07,
    )
    box("roof_lip", (xf - 0.2, 0, zt + 0.01), (0.06, 2.2, 0.03), M["olive_dark"], cab, 0.008)
    box("roof_lamp", (xf - 0.45, 0, zt + 0.05), (0.08, 0.12, 0.07), M["amber"], cab, 0.008)
    for s in (-1, 1):
        # windscreen pane in its frame
        hull(f"windscreen{s}", [(xf + 0.012 - t * 0.155, s * y, 1.98 + t * 0.56) for t in (0, 1) for y in (0.05, 1.0)], M["glass"], cab, 0.0)
        # door: team colour panel with the drop glass above the belt line
        dx0, dx1 = xf - 0.22, xb + 0.32
        hull(f"door_team{s}", [(x, s * (hw + 0.006), z) for x in (dx0, dx1) for z in (1.18, 1.96)], M["team"], cab, 0.0)
        hull(f"door_glass{s}", [(x, s * (hw + 0.006 - (z - 2.0) * 0.03), z) for x in (dx0 - 0.04, dx1 + 0.05) for z in (2.02, 2.5)], M["glass"], cab, 0.0)
        for x in (dx0, dx1):
            box(f"door_seam{s}{x:.2f}", (x, s * (hw + 0.008), 1.8), (0.02, 0.01, 1.3), M["olive_dark"], cab, 0.0)
        box(f"door_handle{s}", (dx1 + 0.12, s * (hw + 0.02), 1.88), (0.12, 0.02, 0.03), M["black"], cab, 0.0)
        hull(f"team_line_cab{s}", [(x, s * (hw + 0.007), z) for x in (xf + 0.02, dx0) for z in (1.3, 1.42)], M["team"], cab, 0.0)
        # quarter window behind the door, mirror on its bar, steps
        hull(f"quarter{s}", [(x, s * (hw + 0.006), z) for x in (xb + 0.08, xb + 0.26) for z in (2.05, 2.45)], M["glass"], cab, 0.0)
        tube_between(f"mirror_bar{s}", (xf - 0.05, s * hw, 2.2), (xf + 0.05, s * (hw + 0.2), 2.35), 0.016, M["black"], cab, 6)
        box(f"mirror{s}", (xf + 0.05, s * (hw + 0.22), 2.32), (0.03, 0.16, 0.26), M["black"], cab, 0.01)
        box(f"step{s}", (xf - 0.65, s * (hw - 0.05), 0.68), (0.45, 0.22, 0.04), M["black"], cab, 0.005)
        tube_between(f"grab{s}", (xb + 0.05, s * (hw + 0.03), 1.4), (xb + 0.05, s * (hw + 0.03), 2.2), 0.015, M["black"], cab, 6)
    box("window_post", (xf - 0.08, 0, 2.27), (0.03, 0.08, 0.58), M["olive_dark"], cab, 0.0)
    hull("rear_window", [(xb - 0.005, y, z) for y in (-0.55, 0.55) for z in (2.0, 2.4)], M["glass"], cab, 0.0)
    # air filter can and snorkel on the right of the bonnet root, exhaust on the right behind the cab
    cyl("air_filter", (xf + 0.12, -0.85, 1.75), 0.14, 0.45, "Z", M["olive_dark"], cab, 16)
    cyl("exhaust", (xb - 0.12, -1.0, 1.85), 0.06, 1.3, "Z", M["black"], cab, 12)


# ------------------------------------------------------------------ rear deck: spare wheel, boxes, fenders


def build_rear_deck(root, M):
    deck = node("Deck", (0, 0, 0), root)
    # spare wheel standing upright behind the cab in its frame
    sx = CAB_X[1] - 0.32
    cyl("spare", (sx, 0.55, 1.75), TYRE_R, TYRE_W, "X", M["tyre"], deck, 40)
    for k in range(18):
        a = k / 18 * 2 * math.pi
        lug = box(f"spare_lug{k}", (0, 0, TYRE_R + 0.01), (TYRE_W * 0.85, 0.08, 0.04), M["tyre"], deck, 0.005)
        lug.location = (sx, 0.55, 1.75)
        lug.rotation_euler = (a, 0, 0)
    cyl("spare_rim", (sx + 0.21, 0.55, 1.75), TYRE_R * 0.58, 0.04, "X", M["olive"], deck, 28)
    for s in (-1, 1):
        box(f"spare_post{s}", (sx, 0.55 + s * 0.6, 1.72), (0.08, 0.06, 1.2), M["olive_dark"], deck, 0.006)
    # equipment boxes and the crew/operator chest between the spare wheel and the launcher (left/right)
    box("box_left", (-0.25, 0.55, 1.42), (0.6, 0.95, 0.5), M["olive"], deck, 0.02)
    box("box_left_lid", (-0.25, 0.55, 1.68), (0.62, 0.97, 0.04), M["olive_dark"], deck, 0.008)
    box("box_right", (-0.05, -0.65, 1.55), (0.95, 0.75, 0.75), M["olive"], deck, 0.02)
    box("box_right_lid", (-0.05, -0.65, 1.94), (0.97, 0.77, 0.04), M["olive_dark"], deck, 0.008)
    for k, x in enumerate((-0.4, 0.3)):
        box(f"box_hasp{k}", (x, -1.03, 1.7), (0.08, 0.02, 0.1), M["black"], deck, 0.0)
    # sub-frame and deck plate
    box("subframe", ((0.35 + REAR + 0.15) / 2, 0, 1.17), (0.35 - REAR - 0.15, 1.1, 0.1), M["olive_dark"], deck, 0.01)
    # flat rear fenders over the tandem with ribbed side boxes (the grilled lockers of the drawing)
    xf, xr = AX[1] + 0.75, AX[2] - 0.75
    for s in (-1, 1):
        box(f"fender{s}", ((xf + xr) / 2, s * 1.0, 1.24), (xf - xr, 0.42, 0.04), M["olive"], deck, 0.01)
        for x in (xf, xr):
            box(f"fender_end{s}{x:.1f}", (x, s * 1.0, 1.08), (0.04, 0.42, 0.3), M["olive"], deck, 0.008)
        box(f"locker{s}", ((AX[1] + 0.75 + 0.5) / 2 + 0.1, s * 1.02, 1.0), (0.45, 0.32, 0.4), M["olive"], deck, 0.015)
        # side line in the faction colour along the fender edge
        hull(f"team_line_rear{s}", [(x, s * 1.215, z) for x in (xf, xr) for z in (1.2, 1.27)], M["team"], deck, 0.0)
    return deck


# ------------------------------------------------------------------ launcher: turntable, cradle, 40-tube pack


def build_launcher(root, M):
    lau = node("Launcher", (0, 0, 0), root)
    tx = TURRET_X
    cyl("turn_ring", (tx, 0, 1.3), 0.72, 0.14, "Z", M["olive_dark"], lau, 40)
    cyl("turn_base", (tx, 0, 1.42), 0.66, 0.12, "Z", M["olive"], lau, 40)
    # upper carriage: wedge-shaped saddle rising toward the trunnion, side cheeks
    tr_x, tr_z = TRUNNION
    hull(
        "saddle",
        [(tx + 0.85, s * 0.7, 1.48) for s in (-1, 1)]
        + [(tx - 0.9, s * 0.7, 1.48) for s in (-1, 1)]
        + [(tr_x - 0.1, s * 0.62, tr_z - 0.05) for s in (-1, 1)]
        + [(tx + 0.85, s * 0.62, 1.66) for s in (-1, 1)],
        M["olive"],
        lau,
        0.03,
    )
    for s in (-1, 1):
        cyl(f"trunnion{s}", (tr_x, s * 0.72, tr_z), 0.1, 0.12, "Y", M["olive_dark"], lau, 16)
        # elevating screw / hydraulic jack from the carriage to the underside of the pack
        a = math.radians(PACK_DEG)
        ex, ez = tr_x + 1.45 * math.cos(a), tr_z + 1.45 * math.sin(a) + 0.02
        tube_between(f"jack{s}", (tx + 0.7, s * 0.5, 1.62), (ex, s * 0.5, ez), 0.055, M["steel"], lau, 12)
        tube_between(f"jack_body{s}", (tx + 0.7, s * 0.5, 1.6), (tx + 0.7 + (ex - tx - 0.7) * 0.45, s * 0.5, 1.6 + (ez - 1.6) * 0.45), 0.085, M["olive_dark"], lau, 12)
    # traverse handwheel and the sight box on the left
    cyl("handwheel", (tx + 0.35, 0.78, 1.72), 0.14, 0.03, "Y", M["black"], lau, 16)
    box("sight_box", (tx + 0.1, 0.72, 1.82), (0.25, 0.14, 0.28), M["olive_dark"], lau, 0.01)

    # tube pack: pivots on the rear trunnion, muzzles rise forward over the cab at PACK_DEG
    pack = node("Pack", (tr_x, 0, tr_z), lau, rot=(0, -math.radians(PACK_DEG), 0))
    L = TUBE_LEN
    w, h = COLS * PITCH, ROWS * PITCH
    z0 = 0.16  # tubes sit on the cradle above the pivot
    box("cradle", (L / 2, 0, z0 - 0.07), (L * 0.92, w * 0.82, 0.12), M["olive_dark"], pack, 0.015)
    for r in range(ROWS):
        for c in range(COLS):
            y = (c - (COLS - 1) / 2) * PITCH
            z = z0 + 0.08 + r * PITCH
            cyl(f"tube{r}_{c}", (L / 2, y, z), TUBE_R, L, "X", M["olive"], pack, 14)
            for x in (0.0, L):  # bores at both ends
                cyl(f"bore{r}_{c}_{x:.0f}", (x + (-0.005 if x == 0 else 0.005), y, z), TUBE_R * 0.78, 0.012, "X", M["bore"], pack, 12)
    # clamp frames round the pack and the guide rails along the top and sides
    for k, x in enumerate((0.18, 1.05, 1.95, 2.82)):
        for zz in (z0, z0 + h + 0.02):
            box(f"band_h{k}{zz:.1f}", (x, 0, zz), (0.07, w + 0.05, 0.04), M["olive_dark"], pack, 0.006)
        for s in (-1, 1):
            box(f"band_v{k}{s}", (x, s * (w / 2 + 0.015), z0 + h / 2 + 0.01), (0.07, 0.03, h + 0.06), M["olive_dark"], pack, 0.006)
    for s in (-1, 1):
        box(f"side_rail{s}", (L / 2, s * (w / 2 + 0.035), z0 + h / 2), (L * 0.95, 0.02, 0.06), M["olive"], pack, 0.005)
    return lau


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
    tmp = os.path.join(os.environ.get("TEMP", HERE), f"bm21-{FACTION}-{os.path.basename(path)}.tmp.png")
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
        print(f"[bm21-{FACTION}] {i + 1}/{len(cols)}", flush=True)
    img = bpy.data.images.new(os.path.basename(path), OUT * len(cols), OUT, alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    os.remove(tmp)
    print(f"[bm21-{FACTION}] wrote {path}", flush=True)


def main():
    sc, _floor = setup(OUT * SS, SAMPLES)
    M = mats()
    rig = node("Rig", (0, 0, 0), None)
    rig.scale = (1, 1, HEIGHT_SCALE)
    chassis = node("Chassis", (0, 0, 0), rig)
    build_chassis(chassis, M)
    launcher = node("Module_launcher", (0, 0, 0), rig)
    build_launcher(launcher, M)
    smooth([o for o in sc.objects if o.type == "MESH" and o.name != "Floor"])
    if SIDE:
        # large check renders: 3/4 front-left and pure side-on (left), 1024 px, to compare with the blueprint
        sc.render.resolution_x = sc.render.resolution_y = 1024
        cam = camera(sc, 9.0, pivot=(32, 40))
        rig.rotation_euler = (0, 0, model_yaw(28))
        sc.render.filepath = os.path.join(SPRITES, f"bm21-{FACTION}-check-34.png")
        bpy.ops.render.render(write_still=True)
        cam.rotation_euler = (math.radians(90), 0, 0)
        cam.location = (0, -60, 1.9 * HEIGHT_SCALE)
        rig.rotation_euler = (0, 0, math.pi)  # nose to the left, left side toward the camera
        sc.render.filepath = os.path.join(SPRITES, f"bm21-{FACTION}-check-side.png")
        bpy.ops.render.render(write_still=True)
        return
    camera(sc, CELL / PX_PER_M)
    cols = (4, 12, 20, 28) if PREVIEW else range(DIRS)
    sfx = "-preview" if PREVIEW else ""
    meshes = lambda ob: [o for o in ob.children_recursive if o.type == "MESH"]
    if MODULE:
        # the launcher module alone with its own shadow, cut away where the truck stands in front of it (holdout);
        # it carries no faction colour, so one sheet serves every nation
        for o in meshes(chassis):
            o.is_holdout = True
        shoot(sc, rig, os.path.join(SPRITES, f"bm21-launcher{sfx}.png"), cols)
    else:
        # the bare Ural-4320 truck (reusable for other modules) with only its own shadow
        for o in meshes(launcher):
            o.hide_render = True
        shoot(sc, rig, os.path.join(SPRITES, f"ural4320-{FACTION}-chassis{sfx}.png"), cols)


main()

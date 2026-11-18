"""
Bushmaster Protected Mobility Vehicle (Thales Australia, 4x4 MRAP). Self-contained Blender model + game sheets
(ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/bushmaster_render.py -- <faction> [SAMPLES] [--preview] [--side]

    <faction>  usa | russia | china | europe | islamic   (team colour = kit.py TEAM, on the side line)
    --preview  4 facings (NE, SE, SW, NW)                          -> bushmaster-<faction>-preview.png
    --side     large 3/4 + side-on check images                    -> bushmaster-<faction>-check-*.png

Dimensions (metres). [Unverified] public figures: length 7.18, width 2.48, height 2.65 (roof ~2.55 + roof kit),
wheelbase ~4.0, track ~2.05, tyres 395/85 R20 (r ~0.55). Shape read off the 1/72 drawing and photos: long low
bonnet with a tall louvred grille and angular front wheel arches, steep windscreen of two armoured panes, a tall
crew box with a V-shaped belly, small square armoured side windows with hinged frames, a louvred vent behind the
cab, stowage bins between the wheels, the spare wheel on the rear right corner, rear door, two roof weapon
stations (front ring with a gun shield, rear pintle), whip antennas and big mirrors.

Paint: Australian disruptive pattern (tan / olive / black-green). Faction colour: a line along each side.
Sheet: 32 columns (ART_GUIDE 3: column 0 = nose straight up the screen, clockwise), one row, 96 px layout cells
stored at 384 px (as the VT 1-2 sheet), the ground centre at PIVOT; tanks' px per metre (PX_PER_M), HEIGHT_SCALE 1.6.
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
from vehiclekit import box, camo_mat, cyl, hull, mat, model_yaw, node, setup, tube_between  # noqa: E402  (infrastructure only)

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

FRONT, REAR = 3.62, -3.56  # 7.18 m
AXLES = (1.98, -2.02)  # 4.0 m wheelbase
TRACK_Y = 1.02
TYRE_R, TYRE_W = 0.55, 0.40
BELLY = 0.55  # V-hull keel
SILL = 1.05  # where the V meets the box sides
ROOF = 2.52
CAB_X = 1.05  # front of the crew box roof (top of the windscreen)
SCREEN_X, SCREEN_Z = 1.62, 1.86  # bottom of the windscreen
BONNET_Z = 1.72
HW = 1.22  # half width of the box at the sill line (2.48 m over the bins)

PAL = dict(
    olive_dark="#3e4130",
    black="#1c1d1a",
    rubber="#1e1e1c",
    steel="#5d605b",
    glass="#26313a",
    lamp="#dcdfd4",
    amber="#d08a1c",
    red="#8c1c16",
    mesh="#232522",
    tan="#a7845f",
)


def mats():
    m = {k: mat(k, v, rough=0.64) for k, v in PAL.items()}
    m["camo"] = camo_mat("camo", ["#a8825f", "#5a5d3c", "#2e3026", "#a8825f", "#5a5d3c"], scale=0.75, rough=0.7)
    m["rubber"] = mat("rubber", PAL["rubber"], rough=0.9, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    m["lamp"] = mat("lamp", PAL["lamp"], rough=0.1, grime=False)
    m["amber"] = mat("amber", PAL["amber"], rough=0.2, grime=False)
    m["red"] = mat("red", PAL["red"], rough=0.25, grime=False)
    m["mesh"] = mat("mesh", PAL["mesh"], rough=0.5, metal=0.6)
    m["rim"] = mat("rim", "#6e5a43", rough=0.6)
    m["team"] = mat("team", TEAM[FACTION], rough=0.5, grime=False)
    return m


# ------------------------------------------------------------------ running gear


def tyre(name, x, s, M, root, y=None, axis="Y", z=TYRE_R):
    """Off-road tyre: chunky tread blocks, sidewall, tan steel rim with bolts and hub."""
    y = s * TRACK_Y if y is None else y
    cyl(f"{name}_tyre", (x, y, z), TYRE_R, TYRE_W, "Y", M["rubber"], root, 36)
    for k in range(20):
        a = k / 20 * 2 * math.pi
        for off in (-1, 1):
            lug = box(f"{name}_lug{k}{off}", (TYRE_R, off * TYRE_W * 0.22, 0), (0.05, TYRE_W * 0.38, 0.09), M["rubber"], root, 0.006)
            lug.location = (x, y, z)
            lug.rotation_euler = (0, -a + off * 0.08, 0)
    cyl(f"{name}_rim", (x, y + s * TYRE_W * 0.42, z), TYRE_R * 0.58, 0.06, "Y", M["rim"], root, 28)
    cyl(f"{name}_dish", (x, y + s * TYRE_W * 0.47, z), TYRE_R * 0.36, 0.05, "Y", M["rim"], root, 24)
    for k in range(8):
        a = k / 8 * 2 * math.pi
        cyl(f"{name}_bolt{k}", (x + 0.15 * math.cos(a), y + s * TYRE_W * 0.51, z + 0.15 * math.sin(a)), 0.018, 0.03, "Y", M["steel"], root, 6)
    cyl(f"{name}_hub", (x, y + s * TYRE_W * 0.53, z), 0.08, 0.07, "Y", M["steel"], root, 14)


def build_running_gear(root, M):
    for s in (-1, 1):
        for i, x in enumerate(AXLES):
            tyre(f"w{s}{i}", x, s, M, root)
            # suspension arms and hub carrier in the wheel well
            box(f"carrier{s}{i}", (x, s * (TRACK_Y - 0.32), TYRE_R), (0.3, 0.25, 0.3), M["black"], root, 0.01)
            tube_between(f"arm{s}{i}", (x - 0.3, s * 0.4, 0.62), (x, s * (TRACK_Y - 0.35), TYRE_R + 0.05), 0.05, M["black"], root, 8)
    # axles / drive shaft under the V belly
    for x in AXLES:
        tube_between(f"axle{x}", (x, -0.75, TYRE_R), (x, 0.75, TYRE_R), 0.07, M["black"], root, 10)


# ------------------------------------------------------------------ hull


def build_hull(root, M):
    C = M["camo"]
    # V-shaped belly: keel along the centre, flaring out to the sills
    hull("belly", [(x, y, z) for x in (REAR + 0.1, 1.15) for (y, z) in ((0.18, BELLY), (-0.18, BELLY), (HW - 0.12, SILL), (-(HW - 0.12), SILL))], C, root, 0.02)
    # crew box: sides lean in a little toward the roof, chamfered roof edge
    box_pts = []
    for x in (REAR, CAB_X + 0.25):
        box_pts += [(x, s * y, z) for s in (-1, 1) for (y, z) in ((HW - 0.12, SILL), (HW - 0.02, 1.32), (HW - 0.12, ROOF - 0.12), (HW - 0.26, ROOF))]
    hull("crew_box", box_pts, C, root, 0.025)
    # cab: windscreen slope from the roof front down to the bonnet, cab sides angle in
    hull("cab", [(x, s * y, z) for s in (-1, 1) for (x, y, z) in (
        (CAB_X + 0.2, HW - 0.26, ROOF), (CAB_X, HW - 0.12, ROOF - 0.12), (CAB_X + 0.25, HW - 0.02, 1.32), (CAB_X + 0.25, HW - 0.12, SILL),
        (SCREEN_X, 1.0, SCREEN_Z), (SCREEN_X + 0.12, 0.98, BONNET_Z), (SCREEN_X + 0.1, HW - 0.12, 1.25), (SCREEN_X, HW - 0.15, SILL))], C, root, 0.025)
    # bonnet: long, narrowing to the nose, gentle slope forward
    hull("bonnet", [(x, s * y, z) for s in (-1, 1) for (x, y, z) in (
        (SCREEN_X, 0.98, BONNET_Z), (FRONT - 0.12, 0.82, BONNET_Z - 0.1), (FRONT, 0.8, BONNET_Z - 0.22),
        (FRONT, 0.84, 0.82), (FRONT - 0.3, 0.86, 0.68), (SCREEN_X, 0.95, 0.78))], C, root, 0.025)
    # angular front wheel arches / mudguards, wider than the bonnet, with the faceted top seen on the references
    for s in (-1, 1):
        hull(f"arch{s}", [(x, s * y, z) for (x, z) in ((AXLES[0] - 0.78, 1.05), (AXLES[0] - 0.55, 1.42), (AXLES[0] + 0.62, 1.42), (FRONT - 0.18, 1.2), (FRONT - 0.18, 0.95), (AXLES[0] - 0.78, 0.92)) for y in (0.82, HW - 0.02)], C, root, 0.02)
        # rear arch lip over the rear wheels
        hull(f"rear_arch{s}", [(x, s * y, z) for (x, z) in ((AXLES[1] - 0.72, 1.12), (AXLES[1] - 0.5, 1.3), (AXLES[1] + 0.55, 1.3), (AXLES[1] + 0.72, 1.12)) for y in (HW - 0.18, HW + 0.01)], C, root, 0.015)
        # front corner bumper blocks with lamps (headlamp, amber indicator)
        hull(f"bumper{s}", [(x, s * y, z) for x in (FRONT - 0.3, FRONT + 0.06) for y in (0.55, 1.08) for z in (0.62, 0.98)], C, root, 0.02)
        box(f"headlamp_box{s}", (FRONT + 0.065, s * 0.95, 0.83), (0.02, 0.18, 0.14), M["black"], root, 0.0)
        cyl(f"headlamp{s}", (FRONT + 0.08, s * 0.98, 0.83), 0.055, 0.02, "X", M["lamp"], root, 14)
        box(f"indicator{s}", (FRONT + 0.08, s * 0.66, 0.83), (0.02, 0.07, 0.1), M["amber"], root, 0.0)
        # tow eyes
        cyl(f"tow{s}", (FRONT + 0.1, s * 0.62, 0.62), 0.06, 0.06, "X", M["steel"], root, 10)
    # radiator grille: tall slatted panel in the nose, dark mesh behind
    box("grille_back", (FRONT + 0.01, 0, 1.17), (0.02, 1.08, 0.62), M["mesh"], root, 0.0)
    for k in range(9):
        box(f"slat{k}", (FRONT + 0.035, 0, 0.9 + k * 0.066), (0.04, 1.06, 0.022), M["camo"], root, 0.0)
    box("grille_frame_t", (FRONT + 0.03, 0, 1.5), (0.05, 1.16, 0.04), M["olive_dark"], root, 0.005)
    box("grille_frame_b", (FRONT + 0.03, 0, 0.85), (0.05, 1.16, 0.04), M["olive_dark"], root, 0.005)
    # bonnet hatch, grab handles, raised air box on the bonnet
    box("bonnet_box", (2.55, 0.0, BONNET_Z - 0.0), (0.42, 0.42, 0.12), C, root, 0.015)
    for s in (-1, 1):
        tube_between(f"bonnet_grab{s}", (2.2, s * 0.62, BONNET_Z - 0.02), (2.9, s * 0.6, BONNET_Z - 0.06), 0.015, M["black"], root, 6)
        box(f"lift_eye{s}", (2.0, s * 0.82, BONNET_Z + 0.03), (0.08, 0.03, 0.08), M["steel"], root, 0.0)

    # windscreen: two armoured panes, framed, set just proud of the slope
    a = math.atan2(ROOF - 0.08 - SCREEN_Z, SCREEN_X - (CAB_X + 0.16))
    for s in (-1, 1):
        y = s * 0.47
        x0, z0 = SCREEN_X - 0.03, SCREEN_Z + 0.05
        x1, z1 = CAB_X + 0.24, ROOF - 0.1
        hull(f"screen_frame{s}", [(x + 0.012, y + dy, z) for (x, z) in ((x0, z0), (x1, z1)) for dy in (-0.44, 0.44)] + [(x - 0.01, y + dy, z) for (x, z) in ((x0, z0), (x1, z1)) for dy in (-0.44, 0.44)], M["black"], root, 0.0)
        hull(f"screen{s}", [(x + 0.03, y + dy, z) for (x, z) in ((x0 - 0.03, z0 + 0.05), (x1 + 0.03, z1 - 0.05)) for dy in (-0.38, 0.38)] + [(x + 0.02, y + dy, z) for (x, z) in ((x0 - 0.03, z0 + 0.05), (x1 + 0.03, z1 - 0.05)) for dy in (-0.38, 0.38)], M["glass"], root, 0.0)
        # wipers
        tube_between(f"wiper{s}", (x0 + 0.02, y - 0.2, z0 + 0.04), (x0 - 0.12, y + 0.18, z0 + 0.26), 0.01, M["black"], root, 6)
    del a
    # cab door windows (larger, angled with the cab side) and crew box windows (small, square, framed, hinged hoods)
    for s in (-1, 1):
        yo = s * (HW - 0.03)
        # cab door window
        hull(f"door_glass{s}", [(x, yo + s * dy, z) for (x, z) in ((CAB_X + 0.32, 1.68), (CAB_X + 0.32, 2.25), (SCREEN_X - 0.08, 1.95), (SCREEN_X - 0.12, 1.68)) for dy in (0.0, 0.025)], M["glass"], root, 0.0)
        hull(f"door_frame{s}", [(x, yo + s * dy, z) for (x, z) in ((CAB_X + 0.26, 1.62), (CAB_X + 0.26, 2.31), (SCREEN_X - 0.02, 1.98), (SCREEN_X - 0.06, 1.62)) for dy in (-0.01, 0.012)], M["black"], root, 0.0)
        # door outline seam and handle
        box(f"door_seam{s}", (CAB_X + 0.22, yo + s * 0.03, 1.55), (0.02, 0.01, 0.9), M["olive_dark"], root, 0.0)
        box(f"door_handle{s}", (CAB_X + 0.5, yo + s * 0.05, 1.5), (0.14, 0.03, 0.03), M["steel"], root, 0.0)
        # mirror on an arm from the cab corner
        tube_between(f"mirror_arm{s}", (SCREEN_X - 0.05, s * (HW - 0.05), 2.05), (SCREEN_X + 0.15, s * (HW + 0.22), 2.1), 0.018, M["black"], root, 6)
        box(f"mirror{s}", (SCREEN_X + 0.17, s * (HW + 0.24), 1.98), (0.05, 0.2, 0.32), M["black"], root, 0.008)
        # crew box windows
        for x in (-0.55, -1.75, -2.85):
            box(f"win_frame{s}{x}", (x, yo + s * 0.04, 1.98), (0.48, 0.05, 0.42), M["olive_dark"], root, 0.008)
            box(f"win{s}{x}", (x, yo + s * 0.07, 1.98), (0.38, 0.02, 0.32), M["glass"], root, 0.0)
            # firing port block under each window
            box(f"port{s}{x}", (x + 0.3, yo + s * 0.07, 1.8), (0.1, 0.08, 0.12), M["olive_dark"], root, 0.006)
        # louvred vent behind the cab
        box(f"vent{s}", (0.42, yo + s * 0.03, 1.88), (0.42, 0.04, 0.6), M["mesh"], root, 0.0)
        for k in range(9):
            box(f"vent_slat{s}{k}", (0.42, yo + s * 0.06, 1.62 + k * 0.065), (0.42, 0.03, 0.02), C, root, 0.0)
        # stowage bins between the wheels, below the window line
        box(f"bin_a{s}", (0.25, s * (HW + 0.02), 1.2), (0.95, 0.12, 0.42), C, root, 0.012)
        box(f"bin_b{s}", (-0.95, s * (HW + 0.02), 1.22), (1.05, 0.12, 0.46), C, root, 0.012)
        for x in (0.25, -0.95):
            box(f"bin_latch{s}{x}", (x, s * (HW + 0.085), 1.33), (0.06, 0.02, 0.05), M["steel"], root, 0.0)
        # jerry-can rack behind the rear wheel on the left, extinguisher on the right (photos)
        if s > 0:
            box("jerry_rack", (-3.05, HW + 0.05, 1.32), (0.5, 0.16, 0.5), C, root, 0.01)
        else:
            cyl("extinguisher", (-2.95, -(HW + 0.06), 1.7), 0.06, 0.4, "X", M["red"], root, 12)
        # faction line: along the crew box above the bins, and on the bonnet side
        hull(f"team_line{s}", [(x, s * (HW + 0.004 - (z - 1.4) * 0.09), z) for x in (REAR + 0.08, CAB_X + 0.2) for z in (1.48, 1.58)], M["team"], root, 0.0)
        hull(f"team_bonnet{s}", [(x, s * y, z) for (x, y) in ((SCREEN_X + 0.05, 0.988), (FRONT - 0.25, 0.835)) for z in (1.42, 1.52)], M["team"], root, 0.0)
        # mud flaps behind each wheel
        for x in AXLES:
            box(f"flap{s}{x}", (x - 0.7, s * TRACK_Y, 0.45), (0.03, 0.42, 0.55), M["black"], root, 0.0)
        # grab rails along the roof edge
        tube_between(f"roof_rail{s}", (-3.2, s * (HW - 0.3), ROOF + 0.06), (-0.2, s * (HW - 0.3), ROOF + 0.06), 0.015, M["black"], root, 6)

    # rear: door (on the left half), step, tail lights, spare wheel on the right corner
    box("rear_plate", (REAR - 0.01, 0, 1.75), (0.02, 2.0, 1.4), M["olive_dark"], root, 0.0)
    box("rear_door", (REAR - 0.03, 0.32, 1.72), (0.04, 0.9, 1.45), C, root, 0.01)
    box("rear_door_win", (REAR - 0.06, 0.32, 2.15), (0.02, 0.28, 0.3), M["glass"], root, 0.0)
    box("rear_handle", (REAR - 0.07, 0.68, 1.75), (0.03, 0.04, 0.2), M["steel"], root, 0.0)
    box("rear_step", (REAR - 0.25, 0.32, 0.72), (0.45, 0.8, 0.05), M["steel"], root, 0.005)
    for s in (-1, 1):
        box(f"taillight{s}", (REAR - 0.03, s * 1.0, 1.15), (0.03, 0.16, 0.22), M["red"], root, 0.004)
    tyre("spare", REAR - 0.28, -1, M, root, y=-0.55, z=1.88)
    sp = [o for o in bpy.context.scene.objects if o.name.startswith("spare_")]
    pivot = node("spare_rot", (REAR - 0.28, -0.55, 1.88), root)
    for o in sp:
        o.parent = pivot
        o.location = Vector(o.location) - Vector((REAR - 0.28, -0.55, 1.88))
    pivot.rotation_euler = (0, 0, math.pi / 2)
    box("spare_bracket", (REAR - 0.06, -0.55, 1.88), (0.1, 0.3, 0.3), M["black"], root, 0.006)

    # roof: hatches, front weapon station with shield, rear pintle MG, antennas, roof boxes
    for i, x in enumerate((-0.9, -1.9)):
        for s in (-1, 1):
            box(f"hatch{i}{s}", (x, s * 0.45, ROOF + 0.02), (0.7, 0.55, 0.04), M["olive_dark"], root, 0.008)
    box("roof_box", (-2.75, 0.0, ROOF + 0.08), (0.6, 0.9, 0.16), C, root, 0.012)
    # front ring mount above the cab, behind the windscreen
    cyl("ring", (CAB_X - 0.15, 0.3, ROOF + 0.06), 0.42, 0.1, "Z", M["olive_dark"], root, 32)
    hull("gun_shield", [(CAB_X + 0.22, y, z) for y in (-0.15, 0.75) for z in (ROOF + 0.1, ROOF + 0.55)] + [(CAB_X + 0.12, y, z) for y in (-0.18, 0.78) for z in (ROOF + 0.1, ROOF + 0.55)], C, root, 0.01)
    gx, gy, gz = CAB_X - 0.05, 0.3, ROOF + 0.42
    box("mg_body", (gx, gy, gz), (0.75, 0.12, 0.13), M["black"], root, 0.006)
    cyl("mg_barrel", (gx + 0.75, gy, gz + 0.02), 0.025, 0.8, "X", M["black"], root, 10)
    box("mg_box", (gx - 0.05, gy - 0.12, gz - 0.06), (0.22, 0.1, 0.16), M["olive_dark"], root, 0.004)
    tube_between("mg_post", (gx, gy, ROOF + 0.1), (gx, gy, gz - 0.06), 0.03, M["black"], root, 8)
    # rear pintle MG
    rx, ry, rz = -3.05, -0.55, ROOF + 0.4
    tube_between("rmg_post", (rx, ry, ROOF), (rx, ry, rz - 0.06), 0.03, M["black"], root, 8)
    box("rmg_body", (rx + 0.1, ry, rz), (0.55, 0.1, 0.11), M["black"], root, 0.005)
    cyl("rmg_barrel", (rx + 0.62, ry, rz + 0.01), 0.02, 0.5, "X", M["black"], root, 10)
    # whip antennas: one tall curved forward (tied down) on the right rear, a straight one on the left
    tube_between("ant_base_r", (-0.2, -0.9, ROOF), (-0.2, -0.9, ROOF + 0.15), 0.05, M["black"], root, 8)
    prev = (-0.2, -0.9, ROOF + 0.15)
    for k in range(1, 7):
        t = k / 6
        p = (-0.2 + 1.3 * t * t, -0.9, ROOF + 0.15 + 1.1 * math.sin(t * math.pi * 0.62))
        tube_between(f"ant_r{k}", prev, p, 0.012, M["black"], root, 6)
        prev = p
    tube_between("ant_l", (-3.2, 0.95, ROOF), (-3.25, 0.95, ROOF + 1.4), 0.012, M["black"], root, 6)
    cyl("ant_l_base", (-3.2, 0.95, ROOF + 0.05), 0.05, 0.1, "Z", M["black"], root, 10)
    # snorkel-style air intake on the right front cab pillar (photos)
    cyl("intake", (SCREEN_X - 0.25, -(HW - 0.08), ROOF - 0.15), 0.1, 0.5, "Z", M["black"], root, 14)


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
    tmp = os.path.join(os.environ.get("TEMP", HERE), f"bushmaster-{FACTION}-{os.path.basename(path)}.tmp.png")
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
        print(f"[bushmaster-{FACTION}] {i + 1}/{len(cols)}", flush=True)
    img = bpy.data.images.new(os.path.basename(path), OUT * len(cols), OUT, alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    os.remove(tmp)
    print(f"[bushmaster-{FACTION}] wrote {path}", flush=True)


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
    build_running_gear(body, M)
    build_hull(body, M)
    smooth([o for o in sc.objects if o.type == "MESH" and o.name != "Floor"])
    if SIDE:
        sc.render.resolution_x = sc.render.resolution_y = 1024
        cam = camera(sc, 10.0, pivot=(48, 52))
        rig.rotation_euler = (0, 0, model_yaw(28))
        sc.render.filepath = os.path.join(SPRITES, f"bushmaster-{FACTION}-check-34.png")
        bpy.ops.render.render(write_still=True)
        cam.rotation_euler = (math.radians(90), 0, 0)
        cam.location = (0.0, -60, 1.5 * HEIGHT_SCALE)
        rig.rotation_euler = (0, 0, 0)
        sc.render.filepath = os.path.join(SPRITES, f"bushmaster-{FACTION}-check-side.png")
        bpy.ops.render.render(write_still=True)
        return
    camera(sc, CELL / PX_PER_M)
    if PREVIEW:
        shoot(sc, rig, os.path.join(SPRITES, f"bushmaster-{FACTION}-preview.png"), (4, 12, 20, 28))
    else:
        # one neutral sheet + its faction mask (the game tints the mask with the owner's colour)
        shoot(sc, rig, os.path.join(SPRITES, "bushmaster.png"), range(DIRS))
        mask_mode(sc, floor, M["team"])
        shoot(sc, rig, os.path.join(SPRITES, "bushmaster-team.png"), range(DIRS))


main()

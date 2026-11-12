"""
Oshkosh HEMTT M977A4 8x8 cargo truck (USA): self-contained Blender model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/hemtt_render.py -- [SAMPLES] [--preview]

Built in REAL metres from the blueprints / photos (M977 / M983A4 family):
    length 10.17 m, width 2.44 m, cab roof 2.85 m, 4 axles in two tandems (front overhang 1.25, tandem spacing 1.52,
    axle 2 -> 3 3.80 m), track 2.0 m, 16.00R20 tyres (r 0.625 m, 0.42 m wide), CARC desert tan paint.
Shape: angular armoured-style cab — vertical upper face, lower face sloping back under the bumper, two flat raked
windscreen panes, chamfered roof edges, square lamp housings at the corners, 5 amber roof markers, big mirrors on arms;
behind the cab the engine box with its side grille (right), round air cleaner (left), exhaust stack and an upright spare
wheel; ISO 20 ft container on a flatrack (desert tan like the truck). Screen size is set in the game (TruckSheets.ts HEMTT_SCALE), not here.

Modular (modular_sheet.py): CHASSIS = frame, axles, wheels, cab, engine box -> truck-hemtt-usa-chassis.png;
MODULES 'body' = 20 ft container on its flatrack on MOUNT -> truck-hemtt-usa-body.png. A weapon module later: add build_<name> on MOUNT.
Axes: +X front (u), +Y left (v), +Z up (z), metres.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from modular_sheet import render_modular  # noqa: E402  (camera / passes / export only)
from vehiclekit import box, cyl, hull, mat, node, tube_between  # noqa: E402  (primitives and materials only)

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
PREVIEW = "--preview" in ARGS
SAMPLES = next((int(a) for a in ARGS if a.isdigit()), 32)

LENGTH, WIDTH = 10.17, 2.44
FRONT = LENGTH / 2
AX = (FRONT - 1.25, FRONT - 1.25 - 1.52, FRONT - 1.25 - 1.52 - 3.80, FRONT - 1.25 - 1.52 - 3.80 - 1.52)
TRACK = 2.0
TYRE_R, TYRE_W = 0.625, 0.42
FRAME_Z = (0.98, 1.26)
MOUNT = (1.55, -FRONT + 0.02, 1.26)  # module deck: front x, rear x, deck z

PAL = dict(
    tan="#bba277",
    tan_dark="#9c8660",
    black="#1d1c1a",
    tyre="#242322",
    steel="#5d5b56",
    glass="#2c3a46",
    lamp="#dcdcd2",
    amber="#cc7a1c",
    red="#8e1d17",
    grille="#2a2722",
    box="#bba277",
    box_dark="#9c8660",
    box_rib="#c0a77c",
)


def mats():
    m = {k: mat(k, v, rough=0.66) for k, v in PAL.items()}
    m["tyre"] = mat("tyre", PAL["tyre"], rough=0.92, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    for k in ("lamp", "amber", "red"):
        m[k] = mat(k, PAL[k], rough=0.2, grime=False)
    return m


def tyre(name, x, y, z, M, parent, side):
    """16.00R20 cross-country tyre: chevron lugs, tan steel rim with 10 nuts, hub and CTIS hose."""
    cyl(f"{name}_tyre", (x, y, z), TYRE_R, TYRE_W, "Y", M["tyre"], parent, 40)
    cyl(f"{name}_wall", (x, y + side * TYRE_W * 0.47, z), TYRE_R * 0.92, 0.03, "Y", M["tyre"], parent, 40)
    for k in range(22):
        a = k / 22 * 2 * math.pi
        for s in (-1, 1):
            lug = box(f"{name}_lug{k}{s}", (TYRE_R + 0.012, s * (TYRE_W * 0.22 + (0.05 if k % 2 else -0.02)), 0), (0.055, TYRE_W * 0.4, 0.1), M["tyre"], parent, 0.008)
            lug.location = (x, y, z)
            lug.rotation_euler = (0, -a, 0)
    ry = y + side * TYRE_W * 0.47
    cyl(f"{name}_rim", (x, ry, z), TYRE_R * 0.55, 0.05, "Y", M["tan_dark"], parent, 32)
    cyl(f"{name}_hub", (x, ry + side * 0.06, z), 0.13, 0.1, "Y", M["tan_dark"], parent, 16)
    cyl(f"{name}_cap", (x, ry + side * 0.12, z), 0.07, 0.04, "Y", M["black"], parent, 12)
    for k in range(10):
        a = k / 10 * 2 * math.pi
        cyl(f"{name}_nut{k}", (x + 0.2 * math.cos(a), ry + side * 0.04, z + 0.2 * math.sin(a)), 0.022, 0.03, "Y", M["steel"], parent, 6)


def build_chassis(root, M):
    z0, z1 = FRAME_Z
    for s in (-1, 1):
        box(f"rail{s}", ((MOUNT[1] + FRONT - 0.4) / 2, s * 0.45, (z0 + z1) / 2), (FRONT - 0.4 - MOUNT[1], 0.11, z1 - z0), M["tan_dark"], root, 0.01)
    for i, x in enumerate((4.3, 2.9, 1.2, -0.6, -2.2, -3.6, -4.9)):
        box(f"xm{i}", (x, 0, (z0 + z1) / 2), (0.12, 0.9, 0.16), M["tan_dark"], root, 0.008)
    for i, x in enumerate(AX):
        z = TYRE_R
        tube_between(f"axle{i}", (x, -TRACK / 2 + 0.2, z), (x, TRACK / 2 - 0.2, z), 0.08, M["black"], root, 12)
        hull(f"diff{i}", [(x + dx, dy, z + dz) for dx in (-0.24, 0.24) for dy in (-0.22, 0.22) for dz in (-0.22, 0.2)], M["tan_dark"], root, 0.04)
        for s in (-1, 1):
            tyre(f"wheel{i}{'L' if s > 0 else 'R'}", x, s * TRACK / 2, TYRE_R, M, root, s)
    for s in (-1, 1):  # walking-beam suspension of each tandem
        for a, b in ((AX[0], AX[1]), (AX[2], AX[3])):
            box(f"beam{s}{a:.1f}", ((a + b) / 2, s * 0.55, TYRE_R + 0.2), (b - a - 0.1 if b > a else a - b + 0.3, 0.1, 0.14), M["black"], root, 0.01)
    for a, b in ((0, 1), (1, 2), (2, 3)):
        tube_between(f"shaft{a}", (AX[a] - 0.26, 0, TYRE_R + 0.05), (AX[b] + 0.26, 0, TYRE_R + 0.05), 0.05, M["black"], root, 10)
    box("transfer", (0.4, 0, 0.85), (0.6, 0.55, 0.4), M["tan_dark"], root, 0.03)

    # between the tandems: fuel tank (left), battery/tool boxes and air tanks (right), steps
    cyl("fuel_tank", (0.2, 1.0, 1.0), 0.33, 1.8, "X", M["tan"], root, 28)
    for k, x in enumerate((-0.55, 0.95)):
        box(f"fuel_strap{k}", (x, 1.0, 1.0), (0.05, 0.68, 0.69), M["black"], root, 0.005)
    cyl("fuel_cap", (0.6, 1.0, 1.35), 0.07, 0.06, "Z", M["black"], root, 12)
    box("toolbox", (0.3, -1.0, 1.0), (1.4, 0.4, 0.55), M["tan"], root, 0.02)
    for k in range(3):
        box(f"toolbox_rib{k}", (-0.25 + k * 0.55, -1.205, 1.0), (0.04, 0.01, 0.5), M["tan_dark"], root, 0.0)
    for k, x in enumerate((-0.9, -0.5)):
        cyl(f"air_tank{k}", (x, -0.95, 0.95), 0.13, 0.3, "X", M["tan_dark"], root, 16)

    # rear: bumper, pintle hook, mud flaps, tail lights
    box("rear_bumper", (MOUNT[1] + 0.05, 0, 0.88), (0.14, 2.3, 0.16), M["tan_dark"], root, 0.01)
    cyl("pintle", (MOUNT[1] - 0.05, 0, 0.88), 0.07, 0.16, "X", M["black"], root, 12)
    for s in (-1, 1):
        box(f"mudflap{s}", (AX[3] - TYRE_R - 0.12, s * TRACK / 2, 0.55), (0.02, 0.45, 0.6), M["black"], root, 0.005)
        box(f"taillight{s}", (MOUNT[1] - 0.02, s * 1.0, 0.95), (0.05, 0.24, 0.1), M["red"], root, 0.008)

    build_cab(root, M)


def build_cab(root, M):
    cab = node("Cab", (0, 0, 0), root)
    xf, xb = FRONT - 0.12, FRONT - 2.0  # cab face, back wall
    hw, zt = WIDTH / 2, 2.85
    # angular shell: lower face sloping back under the bumper, vertical upper face, raked windscreen, chamfered roof edges
    prof = [(xf - 0.45, 0.95), (xf, 1.45), (xf, 2.0), (xf - 0.28, zt - 0.05), (xf - 0.36, zt)]
    pts = []
    for x, z in prof:
        cham = 0.12 if z > 2.6 else 0.0
        pts += [(x, s * (hw - cham), z) for s in (-1, 1)]
    pts += [(xb, s * (hw - 0.12), zt) for s in (-1, 1)] + [(xb, s * hw, zt - 0.15) for s in (-1, 1)] + [(xb, s * hw, 0.95) for s in (-1, 1)]
    pts += [(xf - 0.28, s * hw, zt - 0.15) for s in (-1, 1)]
    hull("cab_shell", pts, M["tan"], cab, 0.025)
    # windscreen: two flat raked panes with a centre post
    for s in (-1, 1):
        hull(f"windscreen{s}", [(xf + 0.012 - t * 0.27, s * y, 2.08 + t * 0.66) for t in (0, 1) for y in (0.06, hw - 0.18)], M["glass"], cab, 0.0)
        hull(f"door_glass{s}", [(x, s * (hw + 0.005), z) for x in (xf - 0.5, xf - 1.15) for z in (2.0, 2.62)], M["glass"], cab, 0.0)
        box(f"door_frame{s}", (xf - 0.82, s * (hw + 0.008), 1.75), (0.95, 0.01, 1.45), M["tan_dark"], cab, 0.0)
        box(f"door_inner{s}", (xf - 0.82, s * (hw + 0.012), 1.75), (0.9, 0.01, 1.4), M["tan"], cab, 0.0)
        box(f"handle{s}", (xf - 1.15, s * (hw + 0.025), 1.85), (0.03, 0.02, 0.18), M["black"], cab, 0.0)
        # grab rail and ladder steps under the door
        tube_between(f"grab{s}", (xf - 1.32, s * (hw + 0.04), 1.4), (xf - 1.32, s * (hw + 0.04), 2.3), 0.018, M["black"], cab, 6)
        for k in range(2):
            box(f"step{s}{k}", (xf - 0.8, s * (hw - 0.12), 0.55 + k * 0.32), (0.42, 0.24, 0.035), M["black"], cab, 0.0)
        # mirror heads on tubular arms ahead of the doors
        tube_between(f"mirror_arm{s}", (xf - 0.3, s * hw, 2.0), (xf + 0.1, s * (hw + 0.38), 2.3), 0.02, M["black"], cab, 6)
        box(f"mirror{s}", (xf + 0.1, s * (hw + 0.42), 2.2), (0.05, 0.2, 0.42), M["black"], cab, 0.01)
        cyl(f"convex{s}", (xf + 0.15, s * (hw + 0.42), 2.48), 0.08, 0.03, "X", M["steel"], cab, 14)
        # square lamp housings at the front corners: round headlamp, amber and blackout lamps
        box(f"lamp_box{s}", (xf + 0.02, s * (hw - 0.3), 1.72), (0.08, 0.42, 0.3), M["tan_dark"], cab, 0.01)
        cyl(f"headlamp{s}", (xf + 0.065, s * (hw - 0.22), 1.72), 0.1, 0.03, "X", M["lamp"], cab, 20)
        box(f"amber{s}", (xf + 0.065, s * (hw - 0.44), 1.72), (0.02, 0.1, 0.08), M["amber"], cab, 0.0)
        # brush-guard tube frame round the lamp housing
        for z in (1.55, 1.9):
            tube_between(f"guard{s}{z}", (xf + 0.12, s * (hw - 0.05), z), (xf + 0.12, s * (hw - 0.55), z), 0.015, M["black"], cab, 6)
        # front wheel arches: angular flares over both front axles
        hull(f"arch{s}", [(x, s * (hw + dy), z) for x in (AX[1] - 0.7, AX[0] + 0.7) for dy in (-0.3, 0.02) for z in (1.3, 1.4)] + [(AX[0] + 0.85, s * (hw + 0.02), 1.05)], M["tan"], cab, 0.015)
    box("window_post", (xf - 0.14, 0, 2.4), (0.04, 0.12, 0.72), M["tan_dark"], cab, 0.0)
    # centre front: grille mesh panel and the name plate (dark block), tow shackles and bumper
    box("grille", (xf + 0.01, 0, 1.72), (0.02, 1.0, 0.42), M["grille"], cab, 0.0)
    for k in range(7):
        box(f"slat{k}", (xf + 0.022, 0, 1.53 + k * 0.064), (0.01, 0.98, 0.018), M["tan_dark"], cab, 0.0)
    box("nameplate", (xf + 0.015, 0, 1.98), (0.01, 0.42, 0.06), M["black"], cab, 0.0)
    box("bumper", (FRONT - 0.3, 0, 1.0), (0.22, WIDTH - 0.1, 0.22), M["tan_dark"], cab, 0.015)
    for s in (-1, 1):
        cyl(f"shackle{s}", (FRONT - 0.18, s * 0.55, 0.85), 0.06, 0.06, "Y", M["black"], cab, 12)
    # roof: 5 amber markers, rotating beacon, roof hatch, antenna base
    for k in range(-2, 3):
        box(f"marker{k}", (xf - 0.4, k * 0.4, zt + 0.03), (0.06, 0.1, 0.05), M["amber"], cab, 0.006)
    cyl("beacon", (xb + 0.35, -0.6, zt + 0.08), 0.08, 0.14, "Z", M["amber"], cab, 16)
    box("hatch", (xf - 1.1, 0, zt + 0.02), (0.75, 0.75, 0.05), M["tan_dark"], cab, 0.01)
    cyl("antenna", (xb + 0.2, 0.85, zt + 0.6), 0.008, 1.2, "Z", M["black"], cab, 6)

    # behind the cab: engine box with its side grille (right), round air cleaner (left), exhaust stack, spare wheel
    xe0, xe1 = xb - 1.15, xb
    box("engine_box", ((xe0 + xe1) / 2, -0.35, 2.0), (xe1 - xe0, 1.5, 1.5), M["tan"], cab, 0.02)
    box("engine_grille", ((xe0 + xe1) / 2, -1.105, 2.0), (xe1 - xe0 - 0.2, 0.02, 1.2), M["grille"], cab, 0.0)
    for k in range(9):
        box(f"egrille{k}", ((xe0 + xe1) / 2, -1.115, 1.45 + k * 0.137), (xe1 - xe0 - 0.22, 0.012, 0.03), M["tan_dark"], cab, 0.0)
    cyl("air_cleaner", ((xe0 + xe1) / 2, 0.75, 2.1), 0.32, 0.9, "X", M["tan"], cab, 24)
    cyl("air_cleaner_cap", (xe1 - 0.02, 0.75, 2.1), 0.26, 0.06, "X", M["tan_dark"], cab, 24)
    tube_between("intake_pipe", (xe1 - 0.1, 0.75, 2.4), (xe1 - 0.1, 0.75, zt + 0.15), 0.1, M["tan"], cab, 14)
    cyl("exhaust", (xe0 + 0.15, 1.0, 2.3), 0.07, 1.6, "Z", M["black"], cab, 14)
    cyl("exhaust_guard", (xe0 + 0.15, 1.0, 2.2), 0.1, 0.9, "Z", M["tan_dark"], cab, 14)
    cyl("spare", (xe0 + 0.1, -0.35, 2.75 + TYRE_R - 0.4), TYRE_R, TYRE_W, "X", M["tyre"], cab, 40)
    cyl("spare_rim", (xe0 + 0.33, -0.35, 2.75 + TYRE_R - 0.4), TYRE_R * 0.55, 0.04, "X", M["tan_dark"], cab, 28)


def build_body(root, M):
    """ISO 20 ft container (6.06 x 2.44 x 2.59 m) on a PLS-style flatrack with its A-frame hook post at the front.
    Corrugated steel walls (trapezoid ribs), corner posts and castings, top/bottom rails, corrugated roof dents,
    cargo doors at the rear with 4 locking bars, cam keepers and hinges, CSC plate and stencil blocks."""
    body = node("Body", (0, 0, 0), root)
    xf, xr, z0 = MOUNT
    # flatrack: deck frame, side rails, A-frame headboard with the hook bar
    box("rack_deck", ((xf + xr) / 2, 0, z0 + 0.1), (xf - xr, 2.3, 0.2), M["tan_dark"], body, 0.01)
    for s in (-1, 1):
        box(f"rack_rail{s}", ((xf + xr) / 2, s * 1.13, z0 + 0.12), (xf - xr, 0.08, 0.24), M["tan"], body, 0.01)
        tube_between(f"aframe{s}", (xf - 0.05, s * 0.9, z0 + 0.2), (xf - 0.25, s * 0.25, z0 + 1.55), 0.07, M["tan"], body, 10)
    box("aframe_top", (xf - 0.25, 0, z0 + 1.55), (0.16, 0.6, 0.16), M["tan"], body, 0.01)
    tube_between("hook_bar", (xf - 0.25, -0.3, z0 + 1.68), (xf - 0.25, 0.3, z0 + 1.68), 0.05, M["steel"], body, 10)
    # container
    L, W, H = 6.06, 2.44, 2.59
    cx1, cx0 = xf - 0.42, xf - 0.42 - L
    cb = z0 + 0.2
    ct = cb + H
    hw = W / 2
    C, CD, CR = M["box"], M["box_dark"], M["box_rib"]
    box("shell", ((cx0 + cx1) / 2, 0, (cb + ct) / 2), (L - 0.02, W - 0.06, H - 0.02), C, body, 0.004)
    # corrugated side walls: trapezoid ribs proud of the skin, between the corner posts
    n = 46
    for s in (-1, 1):
        for k in range(n):
            x = cx0 + 0.16 + (k + 0.5) * (L - 0.32) / n
            box(f"cor{s}{k}", (x, s * (hw - 0.03 + 0.012), (cb + ct) / 2), (0.06, 0.03, H - 0.32), CR, body, 0.008)
        for z in (cb + 0.08, ct - 0.08):
            box(f"rail{s}{z:.1f}", ((cx0 + cx1) / 2, s * (hw - 0.01), z), (L, 0.06, 0.16), CD, body, 0.006)
    # front wall and roof: corrugations across
    for k in range(10):
        y = -hw + 0.16 + (k + 0.5) * (W - 0.32) / 10
        box(f"fcor{k}", (cx1 - 0.0, y, (cb + ct) / 2), (0.04, 0.1, H - 0.32), CR, body, 0.006)
    for k in range(24):
        x = cx0 + 0.2 + (k + 0.5) * (L - 0.4) / 24
        box(f"roof{k}", (x, 0, ct - 0.004), (0.1, W - 0.28, 0.02), CR, body, 0.004)
    for x in (cx0 + 0.03, cx1 - 0.03):
        for y in (-hw + 0.03, hw - 0.03):
            box(f"post{x:.1f}{y:.1f}", (x, y, (cb + ct) / 2), (0.1, 0.1, H), CD, body, 0.006)
            for z in (cb + 0.06, ct - 0.06):
                box(f"casting{x:.1f}{y:.1f}{z:.1f}", (x, y, z), (0.18, 0.16, 0.12), M["steel"], body, 0.01)
        box(f"end_top{x:.1f}", (x, 0, ct - 0.07), (0.1, W, 0.14), CD, body, 0.006)
        box(f"end_bot{x:.1f}", (x, 0, cb + 0.07), (0.1, W, 0.14), CD, body, 0.006)
    # rear doors: two leaves, vertical door ribs, 4 locking bars with handles, hinges
    xd = cx0 - 0.012
    box("door_split", (xd, 0, (cb + ct) / 2), (0.02, 0.03, H - 0.3), M["black"], body, 0.0)
    for s in (-1, 1):
        for k in range(4):
            box(f"drib{s}{k}", (xd, s * (0.18 + k * 0.26), (cb + ct) / 2), (0.025, 0.09, H - 0.36), CR, body, 0.004)
        for b in (0.32, 0.88):
            y = s * b
            tube_between(f"lockbar{s}{b}", (xd - 0.04, y, cb + 0.12), (xd - 0.04, y, ct - 0.12), 0.022, M["steel"], body, 8)
            box(f"lhandle{s}{b}", (xd - 0.07, y + s * 0.08, cb + 1.1), (0.03, 0.18, 0.04), M["steel"], body, 0.0)
            for z in (cb + 0.16, ct - 0.16):
                box(f"keeper{s}{b}{z:.1f}", (xd - 0.03, y, z), (0.04, 0.1, 0.08), M["steel"], body, 0.0)
        for z in (cb + 0.4, cb + 1.0, cb + 1.6, cb + 2.2):
            box(f"hinge{s}{z:.1f}", (xd - 0.02, s * (hw - 0.1), z), (0.04, 0.08, 0.1), M["steel"], body, 0.0)
    box("csc_plate", (xd - 0.01, -0.62, cb + 1.55), (0.01, 0.22, 0.14), M["lamp"], body, 0.0)
    # side stencils (owner code / ID as dark blocks) and a small faction-neutral marking panel
    for s in (-1, 1):
        for k in range(6):
            box(f"code{s}{k}", (cx1 - 0.55 - k * 0.14, s * (hw + 0.002), ct - 0.35), (0.1, 0.004, 0.11), M["black"], body, 0.0)
        box(f"cscs{s}", (cx0 + 0.6, s * (hw + 0.002), cb + 0.45), (0.3, 0.004, 0.18), CD, body, 0.0)
    return body


if __name__ == "__main__":
    render_modular("truck-hemtt-usa", build_chassis, {"body": build_body}, mats, SAMPLES, PREVIEW, pivot=(32, 45))  # tall container: ground point 6 px lower than KAMAZ

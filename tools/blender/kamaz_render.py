"""
KAMAZ-4310 6x6 army truck (Russia): self-contained Blender model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/kamaz_render.py -- [SAMPLES] [--preview]

The truck is built in REAL metres from the factory drawing (KAMAZ-4310 / 43118):
    length 7.96 m (front overhang 1.62, wheelbase 3.335 + 1.32, rear overhang 1.74), width 2.50 m, cab roof 2.90 m,
    tarpaulin top 3.28 m, track 2.01 m, tyres 1220 x 400 (r 0.61 m), olive drab paint, canvas tarpaulin.
Screen size is NOT baked into the model: the sheet uses the tanks' px per metre (PX_PER_M, as t90m_sheet.py) and the
game scales it with KAMAZ_SCALE in ui/src/render/TruckSheets.ts. To make the truck bigger, change that one number.

Modular parts (so a weapon module can replace the cargo body later):
    CHASSIS  frame, axles, wheels, cab ("head"), spare wheel, exhaust, fuel tank       -> truck-kamaz-russia-chassis.png
    MODULES  'body': cargo platform with drop sides, bows and tarpaulin                -> truck-kamaz-russia-body.png
A module is mounted on the frame deck (MOUNT, model metres) and is rendered with the chassis as a HOLDOUT, so the cab and
wheels that stand in front of it cut it away: the game draws chassis, then module, and the overlap is always right.
The chassis sheet carries the whole truck's soft shadow (the module casts it while hidden from the camera).
To add a gun module later: write build_<name>(root) placed on MOUNT and add it to MODULES.

Sheets: 32 columns (ART_GUIDE 3: column 0 = nose straight up the screen, clockwise), one row, 64 px layout cells stored
at 256 px; the truck's ground centre at PIVOT. Axes: +X front (u), +Y left (v), +Z up (z), metres.
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
PREVIEW = "--preview" in ARGS
SAMPLES = next((int(a) for a in ARGS if a.isdigit()), 32)

CELL, DIRS, SS, OUT = 64, 32, 2, 256
PIVOT = (32, 39)  # ground centre of the truck in the 64 px layout cell
PX_PER_M = 42 / 7.77  # same sheet px per metre as the tank sheets (t90m_sheet.py HULL_PX / HULL_LEN)
HEIGHT_SCALE = 1.6  # RA2-style chunky look, as the tanks (ART_GUIDE 5)

# ---- real dimensions (m) ----
LENGTH, WIDTH = 7.96, 2.50
FRONT = LENGTH / 2  # bumper face
AX = (FRONT - 1.62, FRONT - 1.62 - 3.335, FRONT - 1.62 - 3.335 - 1.32)  # axle x: 2.36, -0.975, -2.295
TRACK = 2.01
TYRE_R, TYRE_W = 0.61, 0.40
FRAME_Z = (0.92, 1.18)  # ladder frame rails bottom/top
MOUNT = (1.10, -3.98, 1.20)  # module deck: front x, rear x, deck z (top of the frame)

PAL = dict(
    olive="#4c5530",
    olive_dark="#3c4426",
    canvas="#5e5d3b",
    canvas_dark="#4b4a2f",
    black="#1c1c1a",
    tyre="#232321",
    steel="#5a5a55",
    glass="#2b3540",
    lamp="#d9dcd2",
    amber="#c9781e",
    red="#8c1c16",
    plate="#d8d8cc",
)


def mats():
    m = {k: mat(k, v, rough=0.68) for k, v in PAL.items()}
    m["canvas"] = mat("canvas", PAL["canvas"], rough=0.9)
    m["canvas_dark"] = mat("canvas_dark", PAL["canvas_dark"], rough=0.9)
    m["tyre"] = mat("tyre", PAL["tyre"], rough=0.92, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    m["lamp"] = mat("lamp", PAL["lamp"], rough=0.1, grime=False)
    m["amber"] = mat("amber", PAL["amber"], rough=0.2, grime=False)
    m["red"] = mat("red", PAL["red"], rough=0.25, grime=False)
    return m


# ------------------------------------------------------------------ chassis: frame, running gear


def tyre(name, x, y, z, M, parent, side):
    """Off-road tyre: round carcass, chunky cross-country lugs, olive steel rim with bolts and a hub cap."""
    cyl(f"{name}_tyre", (x, y, z), TYRE_R, TYRE_W, "Y", M["tyre"], parent, 40)
    cyl(f"{name}_wall", (x, y + side * TYRE_W * 0.47, z), TYRE_R * 0.93, 0.03, "Y", M["tyre"], parent, 40)
    for k in range(20):
        a = k / 20 * 2 * math.pi
        for s in (-1, 1):
            lug = box(f"{name}_lug{k}{s}", (TYRE_R + 0.012, s * TYRE_W * 0.22 + (0.04 if k % 2 else -0.04) * s, 0), (0.05, TYRE_W * 0.42, 0.1), M["tyre"], parent, 0.008)
            lug.location = (x, y, z)
            lug.rotation_euler = (0, -a, 0)
    rim_y = y + side * TYRE_W * 0.47
    cyl(f"{name}_rim", (x, rim_y, z), TYRE_R * 0.56, 0.05, "Y", M["olive"], parent, 32)
    cyl(f"{name}_dish", (x, rim_y + side * 0.03, z), TYRE_R * 0.4, 0.04, "Y", M["olive_dark"], parent, 24)
    cyl(f"{name}_hub", (x, rim_y + side * 0.07, z), 0.1, 0.08, "Y", M["black"], parent, 16)
    for k in range(8):
        a = k / 8 * 2 * math.pi
        cyl(f"{name}_nut{k}", (x + 0.17 * math.cos(a), rim_y + side * 0.05, z + 0.17 * math.sin(a)), 0.022, 0.03, "Y", M["steel"], parent, 6)
    # central tyre-inflation hose, as on the real truck
    tube_between(f"{name}_cti", (x, rim_y + side * 0.1, z), (x + 0.12, rim_y + side * 0.1, z + 0.32), 0.015, M["black"], parent, 6)


def build_chassis(root, M):
    zf0, zf1 = FRAME_Z
    # ladder frame
    for s in (-1, 1):
        box(f"rail{s}", ((MOUNT[1] + FRONT - 0.3) / 2, s * 0.43, (zf0 + zf1) / 2), (FRONT - 0.3 - MOUNT[1], 0.1, zf1 - zf0), M["black"], root, 0.01)
    for i, x in enumerate((3.3, 1.6, 0.2, -1.6, -3.0, -3.9)):
        box(f"xmember{i}", (x, 0, (zf0 + zf1) / 2), (0.12, 0.86, 0.16), M["black"], root, 0.008)
    # axles, differentials, leaf springs
    for i, x in enumerate(AX):
        z = TYRE_R
        tube_between(f"axle{i}", (x, -TRACK / 2 + 0.2, z), (x, TRACK / 2 - 0.2, z), 0.07, M["black"], root, 12)
        hull(f"diff{i}", [(x + dx, dy, z + dz) for dx in (-0.22, 0.22) for dy in (-0.2, 0.2) for dz in (-0.2, 0.18)], M["olive_dark"], root, 0.04)
        for s in (-1, 1):
            box(f"spring{i}{s}", (x, s * 0.5, z + 0.18), (1.1 if i == 0 else 0.9, 0.08, 0.1), M["black"], root, 0.01)
            tyre(f"wheel{i}{'L' if s > 0 else 'R'}", x, s * TRACK / 2, TYRE_R, M, root, s)
    for i in (0, 1):
        tube_between(f"shaft{i}", (AX[i] - 0.25, 0, TYRE_R + 0.05), (AX[i + 1] + 0.25, 0, TYRE_R + 0.05), 0.045, M["black"], root, 10)
    tube_between("shaft_tc", (0.6, 0, 0.82), (AX[0] - 0.25, 0, TYRE_R + 0.05), 0.045, M["black"], root, 10)
    box("transfer_case", (0.4, 0, 0.8), (0.5, 0.5, 0.35), M["olive_dark"], root, 0.03)

    # under-body equipment between the axles: fuel tank (left), battery box and air tanks (right), side steps
    cyl("fuel_tank", (0.55, 1.05, 0.98), 0.27, 1.05, "X", M["olive"], root, 24)
    for k, x in enumerate((0.1, 1.0)):
        box(f"fuel_strap{k}", (x, 1.05, 0.98), (0.04, 0.56, 0.57), M["black"], root, 0.005)
    box("battery_box", (0.6, -1.02, 0.98), (0.95, 0.42, 0.5), M["olive"], root, 0.02)
    box("battery_lid", (0.6, -1.02, 1.25), (0.97, 0.44, 0.04), M["olive_dark"], root, 0.01)
    for k, x in enumerate((-0.2, 0.15)):
        cyl(f"air_tank{k}", (x, -0.95, 0.95), 0.12, 0.3, "X", M["olive_dark"], root, 16)

    # rear: bumper, tow hook, mud flaps, tail lights (bolted to the frame end, so they stay with any module)
    box("rear_bumper", (MOUNT[1] + 0.02, 0, 0.82), (0.12, 2.1, 0.14), M["black"], root, 0.01)
    cyl("tow_hook", (MOUNT[1] - 0.06, 0, 0.82), 0.06, 0.16, "X", M["steel"], root, 12)
    for s in (-1, 1):
        box(f"mudflap{s}", (AX[2] - TYRE_R - 0.12, s * TRACK / 2, 0.55), (0.02, 0.45, 0.6), M["black"], root, 0.005)
        box(f"taillight{s}", (MOUNT[1] - 0.02, s * 0.95, 0.88), (0.05, 0.22, 0.09), M["red"], root, 0.008)

    build_cab(root, M)


# ------------------------------------------------------------------ cab ("head")


def build_cab(root, M):
    """KAMAZ cab-over: flat upright face with a sloped windscreen, grille band and round headlamps in the bumper."""
    cab = node("Cab", (0, 0, 0), root)
    xf, xb = FRONT - 0.2, FRONT - 2.0  # cab face / back wall
    zb, zt = 1.15, 2.90
    hw = 1.2
    # cab shell: lower face vertical, upper face set back (windscreen slope), slight tumblehome
    hull(
        "cab_shell",
        [(xf, s * hw, zb) for s in (-1, 1)]
        + [(xf, s * hw, 1.95) for s in (-1, 1)]
        + [(xf - 0.2, s * (hw - 0.03), zt - 0.04) for s in (-1, 1)]
        + [(xf - 0.24, s * (hw - 0.06), zt) for s in (-1, 1)]
        + [(xb, s * (hw - 0.06), zt) for s in (-1, 1)]
        + [(xb, s * hw, zb) for s in (-1, 1)],
        M["olive"],
        cab,
        0.04,
    )
    # windscreen (two panes with a centre post) and door windows
    for s in (-1, 1):
        hull(
            f"windscreen{s}",
            [(xf + 0.012 - t * 0.19, s * y, 2.0 + t * 0.78) for t in (0, 1) for y in (0.05, 1.1)],
            M["glass"],
            cab,
            0.0,
        )
        hull(f"door_glass{s}", [(x, s * (hw + 0.004 - (z - 2.0) * 0.02), z) for x in (xf - 0.3, xf - 1.05) for z in (2.02, 2.72)], M["glass"], cab, 0.0)
        box(f"door_seam{s}", (xf - 1.12, s * (hw + 0.005), 1.85), (0.02, 0.01, 1.3), M["olive_dark"], cab, 0.0)
        box(f"door_handle{s}", (xf - 1.0, s * (hw + 0.02), 1.95), (0.14, 0.02, 0.03), M["black"], cab, 0.0)
        # mirror on its arm
        tube_between(f"mirror_arm{s}", (xf - 0.25, s * hw, 2.3), (xf - 0.1, s * (hw + 0.35), 2.45), 0.018, M["black"], cab, 6)
        box(f"mirror{s}", (xf - 0.1, s * (hw + 0.38), 2.4), (0.04, 0.2, 0.36), M["black"], cab, 0.01)
        # front wheel arch flare and step
        hull(f"arch{s}", [(AX[0] + dx, s * (hw + dy), z) for dx in (-0.75, 0.75) for dy in (-0.25, 0.04) for z in (1.15, 1.32)] + [(AX[0] + dx, s * (hw + 0.04), 0.85) for dx in (-0.85, 0.85)], M["black"], cab, 0.02)
        box(f"step{s}", (xf - 0.75, s * (hw - 0.1), 0.72), (0.4, 0.22, 0.04), M["black"], cab, 0.005)
        # headlamps in square housings at bumper height, indicator above
        cyl(f"headlamp{s}", (xf + 0.01, s * 0.82, 1.32), 0.1, 0.06, "X", M["lamp"], cab, 20)
        box(f"lamp_box{s}", (xf - 0.02, s * 0.82, 1.32), (0.05, 0.28, 0.26), M["black"], cab, 0.01)
        box(f"indicator{s}", (xf + 0.005, s * 0.98, 1.6), (0.03, 0.12, 0.07), M["amber"], cab, 0.005)
    box("window_post", (xf - 0.1, 0, 2.38), (0.03, 0.08, 0.8), M["olive_dark"], cab, 0.0)
    # grille band with the slats and the name plate (lettering as dark blocks, ART_GUIDE 6)
    box("grille", (xf + 0.01, 0, 1.55), (0.02, 1.3, 0.3), M["olive_dark"], cab, 0.005)
    for k in range(5):
        box(f"slat{k}", (xf + 0.02, 0, 1.43 + k * 0.06), (0.015, 1.26, 0.02), M["black"], cab, 0.0)
    for k in range(5):
        box(f"letter{k}", (xf + 0.015, -0.32 + k * 0.16, 1.82), (0.01, 0.1, 0.07), M["olive_dark"], cab, 0.0)
    # front bumper, tow eyes, number plate, winch fairlead
    box("bumper", (FRONT - 0.08, 0, 0.98), (0.18, 2.45, 0.3), M["black"], cab, 0.015)
    box("plate", (FRONT + 0.01, -0.45, 1.0), (0.01, 0.52, 0.11), M["plate"], cab, 0.0)
    for s in (-1, 1):
        cyl(f"tow_eye{s}", (FRONT + 0.02, s * 0.6, 0.9), 0.05, 0.08, "X", M["steel"], cab, 10)
    # roof: three amber marker lamps, sun visor lip
    for k in (-1, 0, 1):
        box(f"marker{k}", (xf - 0.3, k * 0.22, zt + 0.03), (0.06, 0.1, 0.05), M["amber"], cab, 0.008)
    box("visor", (xf - 0.22, 0, zt - 0.02), (0.1, 2.3, 0.04), M["olive"], cab, 0.01)
    # air intake on the back wall (right), exhaust stack (left) — between the cab and the module deck
    box("intake", (xb - 0.15, -0.95, 2.3), (0.25, 0.3, 0.9), M["olive"], cab, 0.03)
    cyl("intake_cap", (xb - 0.15, -0.95, 2.82), 0.13, 0.12, "Z", M["olive_dark"], cab, 16)
    cyl("exhaust", (xb - 0.2, 1.05, 2.0), 0.065, 2.0, "Z", M["black"], cab, 14)
    cyl("exhaust_guard", (xb - 0.2, 1.05, 1.85), 0.09, 0.8, "Z", M["olive_dark"], cab, 14)
    cyl("exhaust_cap", (xb - 0.2, 1.05, 3.02), 0.08, 0.06, "Z", M["black"], cab, 14)
    # spare wheel standing upright behind the cab on its carrier
    cyl("spare", (xb - 0.42, 0.25, 1.85), TYRE_R, TYRE_W, "X", M["tyre"], cab, 40)
    cyl("spare_rim", (xb - 0.2, 0.25, 1.85), TYRE_R * 0.56, 0.04, "X", M["olive"], cab, 28)
    box("spare_carrier", (xb - 0.5, 0.25, 1.22), (0.5, 1.3, 0.1), M["black"], cab, 0.01)


# ------------------------------------------------------------------ module: cargo body


def build_body(root, M):
    """Cargo platform: steel floor on cross bearers, olive drop sides with ribs, 5 bows under a canvas tarpaulin."""
    body = node("Body", (0, 0, 0), root)
    xf, xr, z0 = MOUNT
    hw = WIDTH / 2
    box("deck_bearers", ((xf + xr) / 2, 0, z0 + 0.06), (xf - xr - 0.1, 2.0, 0.12), M["black"], body, 0.01)
    box("floor", ((xf + xr) / 2, 0, z0 + 0.16), (xf - xr, WIDTH, 0.08), M["olive_dark"], body, 0.01)
    zs = z0 + 0.2
    zt = zs + 0.55  # top of the drop sides
    # side boards and tail gate, each with horizontal stiffening ribs and vertical stakes
    for s in (-1, 1):
        box(f"side{s}", ((xf + xr) / 2, s * (hw - 0.02), (zs + zt) / 2), (xf - xr, 0.04, zt - zs), M["olive"], body, 0.01)
        for z in (zs + 0.12, zs + 0.3, zt - 0.03):
            box(f"rib{s}{z:.2f}", ((xf + xr) / 2, s * (hw + 0.005), z), (xf - xr - 0.06, 0.03, 0.035), M["olive"], body, 0.008)
        for k in range(6):
            x = xr + 0.1 + k * (xf - xr - 0.2) / 5
            box(f"stake{s}{k}", (x, s * (hw + 0.012), (zs + zt) / 2), (0.06, 0.03, zt - zs), M["olive_dark"], body, 0.006)
        # rope rail and hooks under the side
        box(f"rope_rail{s}", ((xf + xr) / 2, s * (hw + 0.01), zs - 0.02), (xf - xr, 0.03, 0.03), M["black"], body, 0.0)
    box("front_board", (xf - 0.02, 0, (zs + zt + 0.35) / 2), (0.04, WIDTH, zt + 0.35 - zs), M["olive"], body, 0.01)
    box("tailgate", (xr + 0.02, 0, (zs + zt) / 2), (0.04, WIDTH, zt - zs), M["olive"], body, 0.01)
    for z in (zs + 0.15, zt - 0.05):
        box(f"tail_rib{z:.2f}", (xr - 0.005, 0, z), (0.03, WIDTH - 0.06, 0.035), M["olive"], body, 0.006)
    # tarpaulin: box over the bows with a rounded top edge, slightly baggy, tied down along the sides
    ztop = 3.28
    tw = hw - 0.01
    prof = [(0.0, zt - 0.05), (tw, zt - 0.05), (tw, ztop - 0.22), (tw - 0.08, ztop - 0.06), (tw - 0.22, ztop)]
    prof += [(-y, z) for y, z in reversed(prof)]
    pts = [(x, y, z) for x in (xf + 0.01, xr - 0.01) for y, z in prof]
    hull("tarp", pts, M["canvas"], body, 0.05)
    # tarpaulin seams over the bows (slightly darker straps) and tie-down ropes
    for k in range(5):
        x = xr + 0.25 + k * (xf - xr - 0.5) / 4
        hull(f"bow{k}", [(x + dx, y * 1.006, z + 0.006) for dx in (-0.035, 0.035) for y, z in prof], M["canvas_dark"], body, 0.0)
    for s in (-1, 1):
        for k in range(9):
            x = xr + 0.2 + k * (xf - xr - 0.4) / 8
            box(f"tie{s}{k}", (x, s * (tw + 0.012), zt + 0.05), (0.02, 0.01, 0.22), M["black"], body, 0.0)
    # rear flap seam and canvas roll
    box("flap_seam", (xr - 0.012, 0, (zt + ztop) / 2), (0.01, 0.03, ztop - zt - 0.1), M["canvas_dark"], body, 0.0)
    cyl("flap_roll", (xr - 0.04, 0, zt + 0.12), 0.06, WIDTH - 0.2, "Y", M["canvas_dark"], body, 14)
    return body


MODULES = {"body": build_body}


# ------------------------------------------------------------------ sheet rendering


def camera(sc):
    cd = bpy.data.cameras.new("sheetcam")
    cd.type = "ORTHO"
    cd.ortho_scale = CELL / PX_PER_M
    cd.clip_end = 300
    cam = bpy.data.objects.new("sheetcam", cd)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(60), 0, 0)
    q = cam.rotation_euler.to_quaternion()
    up, back = q @ Vector((0, 1, 0)), q @ Vector((0, 0, 1))
    cam.location = up * ((PIVOT[1] - CELL / 2) / PX_PER_M) - Vector((1, 0, 0)) * ((PIVOT[0] - CELL / 2) / PX_PER_M) + back * 60
    sc.camera = cam


def meshes(ob):
    return [o for o in [ob, *ob.children_recursive] if o.type == "MESH"]


def smooth(objs):
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38), keep_sharp_edges=True)
    for o in objs:
        o.select_set(False)


def shoot(sc, rig, path, n):
    """Renders the 32 headings into one row of OUT px cells (SS supersampled, premultiplied box filter)."""
    big = OUT * SS
    acc = np.zeros((OUT, OUT * DIRS, 4), np.float32)
    tmp = os.path.join(os.environ.get("TEMP", HERE), f"kamaz-{os.path.basename(path)}.tmp.png")
    for k in range(n):
        rig.rotation_euler = (0, 0, model_yaw(k if n == DIRS else (4, 12, 20, 28)[k]))
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(tmp)
        buf = np.empty(big * big * 4, np.float32)
        im.pixels.foreach_get(buf)
        bpy.data.images.remove(im)
        buf = buf.reshape(OUT, SS, OUT, SS, 4)
        a = buf[..., 3].mean((1, 3))
        rgb = (buf[..., :3] * buf[..., 3:4]).mean((1, 3)) / np.maximum(a, 1e-6)[..., None]
        acc[:, k * OUT : (k + 1) * OUT, :3] = rgb
        acc[:, k * OUT : (k + 1) * OUT, 3] = a
        print(f"[kamaz] {os.path.basename(path)} {k + 1}/{n}", flush=True)
    acc = acc[:, : OUT * n]
    img = bpy.data.images.new(os.path.basename(path), OUT * n, OUT, alpha=True)
    img.pixels.foreach_set(np.clip(acc, 0, 1).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    os.remove(tmp)
    print(f"[kamaz] wrote {path}", flush=True)


def main():
    sc, floor = setup(OUT * SS, SAMPLES)
    camera(sc)
    M = mats()
    rig = node("Rig", (0, 0, 0), None)
    rig.scale = (1, 1, HEIGHT_SCALE)
    chassis = node("Chassis", (0, 0, 0), rig)
    build_chassis(chassis, M)
    modules = {}
    for name, build in MODULES.items():
        modules[name] = node(f"Module_{name}", (0, 0, 0), rig)
        build(modules[name], M)
    smooth([o for o in sc.objects if o.type == "MESH" and o.name != "Floor"])
    n = 4 if PREVIEW else DIRS
    suffix = "-preview" if PREVIEW else ""
    chassis_objs = meshes(chassis)

    # 1) chassis + cab, with the soft shadow of the whole truck (the cargo body casts it, hidden from the camera)
    for name, root in modules.items():
        for o in meshes(root):
            o.visible_camera = name == "body" and False
            o.hide_render = name != "body"
    shoot(sc, rig, os.path.join(SPRITES, f"truck-kamaz-russia-chassis{suffix}.png"), n)

    # 2) each module alone, cut away where the chassis stands in front of it, no ground shadow
    floor.hide_render = True
    for o in chassis_objs:
        o.is_holdout = True
    for name, root in modules.items():
        for other, r2 in modules.items():
            for o in meshes(r2):
                o.hide_render = other != name
                o.visible_camera = True
        shoot(sc, rig, os.path.join(SPRITES, f"truck-kamaz-russia-{name}{suffix}.png"), n)


main()

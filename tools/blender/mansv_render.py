"""
MAN SV (HX58) 6x6 army truck (Europe): self-contained Blender model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/mansv_render.py -- [SAMPLES] [--preview]

Built in REAL metres from the MAN 6x6 blueprint and the SV/HX photos (values approximated from the drawings):
    length 8.60 m (front overhang 1.42, wheelbase 4.10 + 1.50, rear overhang 1.58), width 2.55 m, cab roof 3.05 m,
    roof pod 3.22 m, tarpaulin top 3.45 m, track 2.10 m, 395/85 R20 tyres (r 0.585 m, 0.40 m wide).
Paint: dark moss green (xanh rêu đậm), canvas tarpaulin a shade lighter, black bumper / arches / lamp housings.
Shape: flat upright cab-over face, near-vertical split windscreen with a black guard frame, black lamp housings at the
lower corners with amber indicators, angled black step-bumper, raised roof pod with its dark grille, black angular wheel
arches, ladder on the cab's back corner; behind the cab the tall air-intake box and the upright spare wheel.
Screen size is set in the game (TruckSheets.ts LAYERED.europe.scale), not here.

Modular (modular_sheet.py): CHASSIS = frame, axles, wheels, cab ("head"), intake, spare -> truck-mansv-europe-chassis.png;
MODULES 'body' = drop-side cargo body with tarpaulin on MOUNT -> truck-mansv-europe-body.png.
A gun module later: write build_<name>(root, M) placed on MOUNT and add it to MODULES.
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

# ---- real dimensions (m) ----
LENGTH, WIDTH = 8.60, 2.55
FRONT = LENGTH / 2
AX = (FRONT - 1.42, FRONT - 1.42 - 4.10, FRONT - 1.42 - 4.10 - 1.50)  # 2.88, -1.22, -2.72
TRACK = 2.10
TYRE_R, TYRE_W = 0.585, 0.40
FRAME_Z = (0.95, 1.22)
CAB_BACK = FRONT - 2.05
MOUNT = (CAB_BACK - 0.95, -FRONT + 0.02, 1.22)  # module deck: front x, rear x, deck z (behind cab + intake/spare)

PAL = dict(
    green="#3b4529",  # dark moss green
    green_dark="#2d3520",
    canvas="#4a5236",
    canvas_dark="#3a4129",
    black="#1b1c19",
    tyre="#222220",
    steel="#5a5b55",
    glass="#26313a",
    lamp="#d9dcd2",
    amber="#cf7a1a",
    red="#8c1c16",
    grille="#1f241a",
    tank="#4d5540",
)


def mats():
    m = {k: mat(k, v, rough=0.7) for k, v in PAL.items()}
    for k in ("canvas", "canvas_dark"):
        m[k] = mat(k, PAL[k], rough=0.92)
    m["tyre"] = mat("tyre", PAL["tyre"], rough=0.93, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["tank"] = mat("tank", PAL["tank"], rough=0.45, metal=0.5)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    for k in ("lamp", "amber", "red"):
        m[k] = mat(k, PAL[k], rough=0.2, grime=False)
    return m


# ------------------------------------------------------------------ chassis: frame, running gear


def tyre(name, x, y, z, M, parent, side):
    """395/85 R20 cross-country tyre: offset block lugs, green steel rim with 10 nuts, hub and CTIS hose."""
    cyl(f"{name}_tyre", (x, y, z), TYRE_R, TYRE_W, "Y", M["tyre"], parent, 40)
    cyl(f"{name}_wall", (x, y + side * TYRE_W * 0.47, z), TYRE_R * 0.92, 0.03, "Y", M["tyre"], parent, 40)
    for k in range(20):
        a = k / 20 * 2 * math.pi
        for s in (-1, 1):
            lug = box(f"{name}_lug{k}{s}", (TYRE_R + 0.012, s * (TYRE_W * 0.22 + (0.05 if k % 2 else -0.02)), 0), (0.055, TYRE_W * 0.4, 0.11), M["tyre"], parent, 0.008)
            lug.location = (x, y, z)
            lug.rotation_euler = (0, -a, 0)
    ry = y + side * TYRE_W * 0.47
    cyl(f"{name}_rim", (x, ry, z), TYRE_R * 0.56, 0.05, "Y", M["green"], parent, 32)
    cyl(f"{name}_dish", (x, ry + side * 0.03, z), TYRE_R * 0.4, 0.04, "Y", M["green_dark"], parent, 24)
    cyl(f"{name}_hub", (x, ry + side * 0.07, z), 0.12, 0.08, "Y", M["green_dark"], parent, 16)
    cyl(f"{name}_cap", (x, ry + side * 0.12, z), 0.06, 0.04, "Y", M["black"], parent, 12)
    for k in range(10):
        a = k / 10 * 2 * math.pi
        cyl(f"{name}_nut{k}", (x + 0.19 * math.cos(a), ry + side * 0.05, z + 0.19 * math.sin(a)), 0.02, 0.03, "Y", M["steel"], parent, 6)
    tube_between(f"{name}_cti", (x, ry + side * 0.1, z), (x + 0.12, ry + side * 0.1, z + 0.3), 0.014, M["black"], parent, 6)


def build_chassis(root, M):
    z0, z1 = FRAME_Z
    for s in (-1, 1):
        box(f"rail{s}", ((MOUNT[1] + FRONT - 0.3) / 2, s * 0.45, (z0 + z1) / 2), (FRONT - 0.3 - MOUNT[1], 0.1, z1 - z0), M["black"], root, 0.01)
    for i, x in enumerate((3.6, 2.2, 0.6, -0.9, -2.0, -3.3, -4.2)):
        box(f"xm{i}", (x, 0, (z0 + z1) / 2), (0.12, 0.9, 0.16), M["black"], root, 0.008)
    for i, x in enumerate(AX):
        z = TYRE_R
        tube_between(f"axle{i}", (x, -TRACK / 2 + 0.2, z), (x, TRACK / 2 - 0.2, z), 0.075, M["black"], root, 12)
        hull(f"diff{i}", [(x + dx, dy, z + dz) for dx in (-0.23, 0.23) for dy in (-0.21, 0.21) for dz in (-0.21, 0.19)], M["green_dark"], root, 0.04)
        for s in (-1, 1):
            box(f"spring{i}{s}", (x, s * 0.52, z + 0.2), (1.1 if i == 0 else 0.9, 0.08, 0.1), M["black"], root, 0.01)
            tyre(f"wheel{i}{'L' if s > 0 else 'R'}", x, s * TRACK / 2, TYRE_R, M, root, s)
    tube_between("shaft0", (AX[1] - 0.25, 0, TYRE_R + 0.05), (AX[2] + 0.25, 0, TYRE_R + 0.05), 0.045, M["black"], root, 10)
    tube_between("shaft1", (0.2, 0, 0.85), (AX[1] + 0.25, 0, TYRE_R + 0.05), 0.045, M["black"], root, 10)
    tube_between("shaft2", (0.6, 0, 0.85), (AX[0] - 0.25, 0, TYRE_R + 0.05), 0.045, M["black"], root, 10)
    box("transfer", (0.4, 0, 0.82), (0.55, 0.52, 0.38), M["green_dark"], root, 0.03)

    # between front and rear axles: big fuel tank (right, as the photos), tool/battery boxes (left), side guard rail
    cyl("fuel_tank", (0.55, -1.02, 0.98), 0.3, 1.25, "X", M["tank"], root, 28)
    for k, x in enumerate((0.05, 1.05)):
        box(f"fuel_strap{k}", (x, -1.02, 0.98), (0.05, 0.62, 0.63), M["black"], root, 0.005)
    cyl("fuel_cap", (0.95, -1.02, 1.3), 0.07, 0.06, "Z", M["black"], root, 12)
    box("toolbox", (0.5, 1.02, 0.98), (1.1, 0.42, 0.5), M["green"], root, 0.02)
    box("toolbox_lid", (0.5, 1.02, 1.24), (1.12, 0.44, 0.04), M["green_dark"], root, 0.01)
    box("battery_box", (-0.45, 1.05, 0.95), (0.55, 0.38, 0.42), M["green"], root, 0.02)
    for s in (-1, 1):
        box(f"guard_rail{s}", ((AX[1] + AX[0]) / 2 - 0.3, s * (WIDTH / 2 - 0.08), 0.7), (2.2, 0.04, 0.06), M["black"], root, 0.0)

    # rear: bumper, tow jaw, mud flaps, tail lights
    box("rear_bumper", (MOUNT[1] + 0.05, 0, 0.85), (0.14, 2.3, 0.16), M["black"], root, 0.01)
    cyl("tow_jaw", (MOUNT[1] - 0.05, 0, 0.85), 0.07, 0.16, "X", M["steel"], root, 12)
    for s in (-1, 1):
        box(f"mudflap{s}", (AX[2] - TYRE_R - 0.12, s * TRACK / 2, 0.55), (0.02, 0.45, 0.6), M["black"], root, 0.005)
        box(f"taillight{s}", (MOUNT[1] - 0.02, s * 1.0, 0.92), (0.05, 0.24, 0.1), M["red"], root, 0.008)

    build_cab(root, M)


# ------------------------------------------------------------------ cab ("head")


def build_cab(root, M):
    """MAN HX/SV cab-over: square upright face, raised roof pod, black corner lamp housings and angled step bumper."""
    cab = node("Cab", (0, 0, 0), root)
    xf, xb = FRONT - 0.32, CAB_BACK  # cab face, back wall
    hw, zb, zt = WIDTH / 2 - 0.02, 1.15, 3.05
    # shell: lower face slightly sloped under the lamps, vertical upper face, small rake at the windscreen, chamfered roof
    prof = [(xf - 0.12, zb), (xf, 1.55), (xf, 2.05), (xf - 0.12, zt - 0.08), (xf - 0.18, zt)]
    pts = []
    for x, z in prof:
        cham = 0.1 if z > 2.9 else 0.0
        pts += [(x, s * (hw - cham), z) for s in (-1, 1)]
    pts += [(xb, s * (hw - 0.1), zt) for s in (-1, 1)] + [(xb, s * hw, zt - 0.12) for s in (-1, 1)] + [(xb, s * hw, zb) for s in (-1, 1)]
    hull("cab_shell", pts, M["green"], cab, 0.03)

    for s in (-1, 1):
        # split windscreen, set in the upper face
        hull(f"windscreen{s}", [(xf + 0.012 - t * 0.11, s * y, 2.12 + t * 0.7) for t in (0, 1) for y in (0.06, hw - 0.12)], M["glass"], cab, 0.0)
        # black windscreen guard: outer frame bars and a diagonal brace (the 'X' guard on the photos)
        tube_between(f"wguard_v{s}", (xf + 0.08, s * (hw - 0.08), 2.08), (xf - 0.03, s * (hw - 0.08), 2.86), 0.02, M["black"], cab, 6)
        tube_between(f"wguard_d{s}", (xf + 0.08, s * 0.08, 2.08), (xf - 0.03, s * (hw - 0.1), 2.84), 0.016, M["black"], cab, 6)
        # door window, door seam, handle
        hull(f"door_glass{s}", [(x, s * (hw + 0.004), z) for x in (xf - 0.35, xf - 1.15) for z in (2.08, 2.75)], M["glass"], cab, 0.0)
        box(f"door_seam{s}", (xf - 1.25, s * (hw + 0.006), 1.9), (0.02, 0.01, 1.4), M["green_dark"], cab, 0.0)
        box(f"door_seam_f{s}", (xf - 0.25, s * (hw + 0.006), 1.9), (0.02, 0.01, 1.4), M["green_dark"], cab, 0.0)
        box(f"handle{s}", (xf - 1.1, s * (hw + 0.02), 1.95), (0.14, 0.02, 0.03), M["black"], cab, 0.0)
        # tall mirror heads on black arms
        tube_between(f"mirror_arm{s}", (xf - 0.2, s * hw, 2.55), (xf + 0.05, s * (hw + 0.3), 2.65), 0.018, M["black"], cab, 6)
        box(f"mirror{s}", (xf + 0.05, s * (hw + 0.34), 2.45), (0.05, 0.18, 0.42), M["black"], cab, 0.01)
        # black lamp housings at the lower corners: headlamp, amber indicator below
        box(f"lamp_box{s}", (xf + 0.02, s * (hw - 0.22), 1.82), (0.12, 0.42, 0.3), M["black"], cab, 0.015)
        cyl(f"headlamp{s}", (xf + 0.085, s * (hw - 0.2), 1.83), 0.09, 0.03, "X", M["lamp"], cab, 20)
        box(f"indicator{s}", (xf + 0.04, s * (hw - 0.22), 1.55), (0.06, 0.26, 0.16), M["amber"], cab, 0.006)
        # black angular wheel arch over the front axle, cab steps
        hull(f"arch{s}", [(AX[0] + dx, s * (hw + dy), z) for dx in (-0.78, 0.7) for dy in (-0.28, 0.05) for z in (1.2, 1.32)] + [(AX[0] + dx, s * (hw + 0.05), 0.9) for dx in (-0.9, 0.82)], M["black"], cab, 0.015)
        for k in range(2):
            box(f"step{s}{k}", (xf - 0.75, s * (hw - 0.1), 0.55 + k * 0.32), (0.42, 0.24, 0.035), M["black"], cab, 0.0)
        # access ladder on the cab's back corner (rails + rungs)
        for dx in (-0.12, 0.12):
            tube_between(f"ladder_rail{s}{dx}", (xb + 0.25 + dx, s * (hw + 0.03), 1.25), (xb + 0.25 + dx, s * (hw + 0.03), zt - 0.05), 0.015, M["black"], cab, 6)
        for k in range(6):
            z = 1.4 + k * 0.28
            tube_between(f"ladder_rung{s}{k}", (xb + 0.13, s * (hw + 0.03), z), (xb + 0.37, s * (hw + 0.03), z), 0.012, M["black"], cab, 6)
    box("window_post", (xf - 0.06, 0, 2.47), (0.04, 0.1, 0.72), M["green_dark"], cab, 0.0)
    tube_between("wguard_top", (xf - 0.03, -(hw - 0.08), 2.86), (xf - 0.03, hw - 0.08, 2.86), 0.02, M["black"], cab, 6)
    # centre face: maker badge (dark block), number plate, small grille slot
    box("badge", (xf + 0.01, 0, 1.98), (0.01, 0.3, 0.06), M["green_dark"], cab, 0.0)
    for k in range(4):
        box(f"slot{k}", (xf + 0.01, 0, 1.68 + k * 0.06), (0.01, 0.9, 0.025), M["grille"], cab, 0.0)
    # angled black step-bumper: V-shaped, sticks out under the face, tow eyes and plate
    hull("bumper", [(x, s * y, z) for s in (-1, 1) for x, y, z in ((xf - 0.05, hw - 0.05, 1.18), (xf - 0.05, hw - 0.05, 0.92), (FRONT, hw - 0.3, 1.1), (FRONT, hw - 0.3, 0.92), (FRONT + 0.02, 0.35, 1.06), (FRONT + 0.02, 0.35, 0.92))], M["black"], cab, 0.02)
    box("plate", (FRONT + 0.03, -0.45, 1.02), (0.01, 0.5, 0.1), M["lamp"], cab, 0.0)
    for s in (-1, 1):
        cyl(f"tow_eye{s}", (FRONT + 0.04, s * 0.55, 0.88), 0.05, 0.06, "Y", M["steel"], cab, 10)

    # raised roof pod, set back from the face, with its dark ventilation grille on the front
    px0, px1 = xf - 0.35, xb + 0.05
    hull("roof_pod", [(x, s * (hw - 0.18 - (0.05 if x > xf - 0.5 else 0)), z) for x in (px0, px1) for s in (-1, 1) for z in (zt - 0.02, zt + 0.17)], M["green"], cab, 0.02)
    box("pod_grille", (px0 + 0.006, 0, zt + 0.08), (0.01, 1.2, 0.1), M["grille"], cab, 0.0)
    for k in range(6):
        box(f"pod_slat{k}", (px0 + 0.012, -0.5 + k * 0.2, zt + 0.08), (0.008, 0.02, 0.1), M["green_dark"], cab, 0.0)
    for k in (-1, 0, 1):
        box(f"marker{k}", (px0 + 0.05, k * 0.4, zt + 0.2), (0.05, 0.08, 0.04), M["amber"], cab, 0.006)
    cyl("beacon", (px1 + 0.25, -0.75, zt + 0.07), 0.07, 0.12, "Z", M["amber"], cab, 14)
    cyl("antenna", (px1 + 0.2, 0.9, zt + 0.6), 0.008, 1.2, "Z", M["black"], cab, 6)

    # behind the cab: tall air-intake box (right), upright spare wheel (centre-left), exhaust stack (left)
    xi = xb - 0.35
    box("intake", (xi, -(hw - 0.3), 2.15), (0.45, 0.55, 1.9), M["green"], cab, 0.03)
    box("intake_grille", (xi, -(hw - 0.025), 2.45), (0.36, 0.01, 0.8), M["grille"], cab, 0.0)
    box("intake_top", (xi, -(hw - 0.3), 3.12), (0.5, 0.6, 0.06), M["green_dark"], cab, 0.01)
    cyl("spare", (xb - 0.5, 0.3, 1.25 + TYRE_R), TYRE_R, TYRE_W, "X", M["tyre"], cab, 40)
    cyl("spare_rim", (xb - 0.28, 0.3, 1.25 + TYRE_R), TYRE_R * 0.56, 0.04, "X", M["green"], cab, 28)
    box("spare_carrier", (xb - 0.5, 0.3, 1.25), (0.55, 1.3, 0.1), M["black"], cab, 0.01)
    cyl("exhaust", (xb - 0.75, hw - 0.12, 2.0), 0.065, 2.0, "Z", M["black"], cab, 14)
    cyl("exhaust_guard", (xb - 0.75, hw - 0.12, 1.85), 0.09, 0.8, "Z", M["green_dark"], cab, 14)


# ------------------------------------------------------------------ module: cargo body


def build_body(root, M):
    """Drop-side cargo body: ribbed green sides and tailgate, 5 bows under a flat-topped canvas tarpaulin."""
    body = node("Body", (0, 0, 0), root)
    xf, xr, z0 = MOUNT
    hw = WIDTH / 2
    box("bearers", ((xf + xr) / 2, 0, z0 + 0.07), (xf - xr - 0.1, 2.0, 0.14), M["black"], body, 0.01)
    box("floor", ((xf + xr) / 2, 0, z0 + 0.18), (xf - xr, WIDTH, 0.08), M["green_dark"], body, 0.01)
    zs, zt = z0 + 0.22, z0 + 0.22 + 0.6
    for s in (-1, 1):
        box(f"side{s}", ((xf + xr) / 2, s * (hw - 0.02), (zs + zt) / 2), (xf - xr, 0.04, zt - zs), M["green"], body, 0.01)
        for k in range(4):  # horizontal corrugation ribs, as the photos
            box(f"rib{s}{k}", ((xf + xr) / 2, s * (hw + 0.005), zs + 0.1 + k * 0.13), (xf - xr - 0.06, 0.03, 0.05), M["green_dark"], body, 0.008)
        for k in range(5):
            x = xr + 0.05 + k * (xf - xr - 0.1) / 4
            box(f"post{s}{k}", (x, s * (hw + 0.015), (zs + zt) / 2), (0.08, 0.04, zt - zs), M["green"], body, 0.006)
        for k in range(8):
            x = xr + 0.25 + k * (xf - xr - 0.5) / 7
            box(f"hook{s}{k}", (x, s * (hw + 0.02), zs - 0.05), (0.05, 0.03, 0.05), M["black"], body, 0.0)
    box("headboard", (xf - 0.03, 0, (zs + zt + 0.4) / 2), (0.06, WIDTH, zt + 0.4 - zs), M["green"], body, 0.01)
    box("tailgate", (xr + 0.02, 0, (zs + zt) / 2), (0.04, WIDTH, zt - zs), M["green"], body, 0.01)
    for z in (zs + 0.12, zt - 0.1):
        box(f"tail_rib{z:.2f}", (xr - 0.005, 0, z), (0.03, WIDTH - 0.06, 0.05), M["green_dark"], body, 0.006)
    # tarpaulin: flat top, rounded upper edges, a shade lighter than the paint
    ztop = 3.45
    tw = hw - 0.01
    prof = [(0.0, zt - 0.05), (tw, zt - 0.05), (tw, ztop - 0.14), (tw - 0.06, ztop - 0.03), (tw - 0.16, ztop)]
    prof += [(-y, z) for y, z in reversed(prof)]
    hull("tarp", [(x, y, z) for x in (xf + 0.01, xr - 0.01) for y, z in prof], M["canvas"], body, 0.05)
    for k in range(5):
        x = xr + 0.25 + k * (xf - xr - 0.5) / 4
        hull(f"bow{k}", [(x + dx, y * 1.006, z + 0.006) for dx in (-0.035, 0.035) for y, z in prof], M["canvas_dark"], body, 0.0)
    for s in (-1, 1):
        for k in range(10):
            x = xr + 0.2 + k * (xf - xr - 0.4) / 9
            box(f"tie{s}{k}", (x, s * (tw + 0.012), zt + 0.04), (0.02, 0.01, 0.2), M["black"], body, 0.0)
    box("flap_seam", (xr - 0.012, 0, (zt + ztop) / 2), (0.01, 0.03, ztop - zt - 0.1), M["canvas_dark"], body, 0.0)
    cyl("flap_roll", (xr - 0.04, 0, zt + 0.12), 0.06, WIDTH - 0.2, "Y", M["canvas_dark"], body, 14)
    return body


MODULES = {"body": build_body}

if __name__ == "__main__":
    render_modular("truck-mansv-europe", build_chassis, MODULES, mats, SAMPLES, PREVIEW)

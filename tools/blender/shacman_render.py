"""
Shacman SX2190 / SX2300 6x6 army truck (China): self-contained Blender model + game sheets (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/shacman_render.py -- [SAMPLES] [--preview]

Built in REAL metres from the factory drawing: front overhang 1.782, axle 1 -> 2 5.575, tandem 1.45, rear overhang
1.708 (length 10.52 m), width 2.49 m, cab roof 3.295 m with the sun visor, 14.00R20 tyres (r 0.625 m, 0.37 m wide).
Shape: tall flat Steyr-type cab with a big near-upright windscreen and a dark brown sun visor on the roof, black
tubular brush guard over the grille, black bumper with square headlamps, amber lamps and yellow fog lamps, black wheel
arch flares, mirrors on long arms; spare wheel upright behind the cab; long cargo bed with drop sides (louvred top band)
under a canvas tarpaulin on bows. PLA pixel camouflage on paint and canvas: moss green, desert tan, off-white.
Screen size is set in the game (TruckSheets.ts SHACMAN_SCALE), not here.

Modular (modular_sheet.py): CHASSIS = frame, axles, wheels, cab -> truck-shacman-china-chassis.png;
MODULES 'body' = cargo bed + tarpaulin on MOUNT -> truck-shacman-china-body.png. Weapon module later: build_<name> on MOUNT.
Axes: +X front (u), +Y left (v), +Z up (z), metres.
"""
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from modular_sheet import render_modular  # noqa: E402  (camera / passes / export only)
from vehiclekit import box, cyl, hull, lin_rgba, mat, node, tube_between  # noqa: E402  (primitives and materials only)

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
PREVIEW = "--preview" in ARGS
SAMPLES = next((int(a) for a in ARGS if a.isdigit()), 32)

FRONT = (1.782 + 5.575 + 1.45 + 1.708) / 2
AX = (FRONT - 1.782, FRONT - 1.782 - 5.575, FRONT - 1.782 - 5.575 - 1.45)
WIDTH, TRACK = 2.49, 2.02
TYRE_R, TYRE_W = 0.625, 0.37
FRAME_Z = (0.98, 1.24)
MOUNT = (2.72, -FRONT + 0.02, 1.24)  # module deck: front x, rear x, deck z
PIVOT = (32, 45)

# PLA pixel camouflage: (colour, share); dark green blots break up the tan/green/white pattern
CAMO = (("#4f5a33", 0.33), ("#b5a278", 0.32), ("#d6d3c3", 0.17), ("#3a4428", 0.18))
PAL = dict(black="#1d1d1b", tyre="#242322", steel="#5b5a55", glass="#2b3742", lamp="#dcdcd2", amber="#c9781e", fog="#d9b21f", red="#8c1c16", visor="#3f332c", plate="#d9d9cc")


def pixel_camo(name, pixel=0.22, rough=0.7, cloth=False):
    """Digital camo: two snapped white-noise grids (coarse blots of 2x2 pixels over single pixels) stepped through CAMO."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vals = []
    for size, seed in ((pixel * 2, 3.1), (pixel, 7.7)):
        snap = nt.nodes.new("ShaderNodeVectorMath")
        snap.operation = "SNAP"
        snap.inputs[1].default_value = (size, size, size)
        nt.links.new(tc.outputs["Object"], snap.inputs[0])
        wn = nt.nodes.new("ShaderNodeTexWhiteNoise")
        wn.noise_dimensions = "4D"
        wn.inputs["W"].default_value = seed
        nt.links.new(snap.outputs[0], wn.inputs["Vector"])
        vals.append(wn.outputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")  # 65 % coarse blots, 35 % single pixels
    mix.data_type = "FLOAT"
    wn2 = nt.nodes.new("ShaderNodeTexWhiteNoise")
    wn2.noise_dimensions = "4D"
    wn2.inputs["W"].default_value = 11.3
    snap2 = nt.nodes.new("ShaderNodeVectorMath")
    snap2.operation = "SNAP"
    snap2.inputs[1].default_value = (pixel, pixel, pixel)
    nt.links.new(tc.outputs["Object"], snap2.inputs[0])
    nt.links.new(snap2.outputs[0], wn2.inputs["Vector"])
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = 0.65
    nt.links.new(wn2.outputs["Value"], gt.inputs[0])
    nt.links.new(gt.outputs[0], mix.inputs["Factor"])
    nt.links.new(vals[0], mix.inputs["A"])
    nt.links.new(vals[1], mix.inputs["B"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    r = ramp.color_ramp
    r.interpolation = "CONSTANT"
    pos = 0.0
    for i, (hexc, share) in enumerate(CAMO):
        col = lin_rgba(hexc)
        if cloth:  # canvas: a little duller than the painted steel
            col = tuple(c * 0.9 for c in col[:3]) + (1.0,)
        e = r.elements[i] if i < 2 else r.elements.new(pos)
        e.position, e.color = pos, col
        pos += share
    nt.links.new(mix.outputs[0], ramp.inputs["Fac"])
    # fine grime so it is not flat (ART_GUIDE 6)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.0
    dirt = nt.nodes.new("ShaderNodeMix")
    dirt.data_type = "RGBA"
    dirt.blend_type = "MULTIPLY"
    dirt.inputs["Factor"].default_value = 0.12
    nt.links.new(ramp.outputs["Color"], dirt.inputs[6])
    nt.links.new(noise.outputs["Color"], dirt.inputs[7])
    occ = nt.nodes.new("ShaderNodeAmbientOcclusion")
    occ.inputs["Distance"].default_value = 0.2
    nt.links.new(dirt.outputs[2], occ.inputs["Color"])
    nt.links.new(occ.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def mats():
    m = {k: mat(k, v, rough=0.66) for k, v in PAL.items()}
    m["camo"] = pixel_camo("camo")
    m["canvas"] = pixel_camo("canvas", pixel=0.25, rough=0.92, cloth=True)
    m["tyre"] = mat("tyre", PAL["tyre"], rough=0.92, grime=False)
    m["steel"] = mat("steel", PAL["steel"], rough=0.4, metal=0.8)
    m["glass"] = mat("glass", PAL["glass"], glass=True)
    m["visor"] = mat("visor", PAL["visor"], rough=0.35)
    for k in ("lamp", "amber", "fog", "red"):
        m[k] = mat(k, PAL[k], rough=0.2, grime=False)
    return m


def tyre(name, x, y, z, M, parent, side):
    """14.00R20 cross-country tyre: directional lugs, black steel rim with 10 nuts, hub cap, CTIS hose."""
    cyl(f"{name}_tyre", (x, y, z), TYRE_R, TYRE_W, "Y", M["tyre"], parent, 40)
    cyl(f"{name}_wall", (x, y + side * TYRE_W * 0.47, z), TYRE_R * 0.92, 0.03, "Y", M["tyre"], parent, 40)
    for k in range(22):
        a = k / 22 * 2 * math.pi
        for s in (-1, 1):
            lug = box(f"{name}_lug{k}{s}", (TYRE_R + 0.012, s * (TYRE_W * 0.24 + (0.04 if k % 2 else -0.03)), 0), (0.055, TYRE_W * 0.42, 0.11), M["tyre"], parent, 0.008)
            lug.location = (x, y, z)
            lug.rotation_euler = (0, -a, 0)
    ry = y + side * TYRE_W * 0.47
    cyl(f"{name}_rim", (x, ry, z), TYRE_R * 0.55, 0.05, "Y", M["black"], parent, 32)
    cyl(f"{name}_hub", (x, ry + side * 0.06, z), 0.13, 0.1, "Y", M["black"], parent, 16)
    cyl(f"{name}_cap", (x, ry + side * 0.12, z), 0.07, 0.04, "Y", M["red"], parent, 12)
    for k in range(10):
        a = k / 10 * 2 * math.pi
        cyl(f"{name}_nut{k}", (x + 0.2 * math.cos(a), ry + side * 0.04, z + 0.2 * math.sin(a)), 0.022, 0.03, "Y", M["steel"], parent, 6)


def build_chassis(root, M):
    z0, z1 = FRAME_Z
    for s in (-1, 1):
        box(f"rail{s}", ((MOUNT[1] + FRONT - 0.35) / 2, s * 0.44, (z0 + z1) / 2), (FRONT - 0.35 - MOUNT[1], 0.1, z1 - z0), M["black"], root, 0.01)
    for i in range(8):
        box(f"xm{i}", (FRONT - 0.6 - i * 1.32, 0, (z0 + z1) / 2), (0.12, 0.88, 0.16), M["black"], root, 0.008)
    for i, x in enumerate(AX):
        z = TYRE_R
        tube_between(f"axle{i}", (x, -TRACK / 2 + 0.2, z), (x, TRACK / 2 - 0.2, z), 0.08, M["black"], root, 12)
        hull(f"diff{i}", [(x + dx, dy, z + dz) for dx in (-0.24, 0.24) for dy in (-0.22, 0.22) for dz in (-0.22, 0.2)], M["black"], root, 0.04)
        for s in (-1, 1):
            box(f"spring{i}{s}", (x, s * 0.5, z + 0.2), (1.3 if i == 0 else 0.9, 0.09, 0.12), M["black"], root, 0.01)
            tyre(f"wheel{i}{'L' if s > 0 else 'R'}", x, s * TRACK / 2, TYRE_R, M, root, s)
    tube_between("shaft0", (AX[0] - 0.3, 0, TYRE_R + 0.08), (0.2, 0, 0.85), 0.05, M["black"], root, 10)
    tube_between("shaft1", (-0.3, 0, 0.85), (AX[1] + 0.26, 0, TYRE_R + 0.05), 0.05, M["black"], root, 10)
    tube_between("shaft2", (AX[1] - 0.26, 0, TYRE_R + 0.05), (AX[2] + 0.26, 0, TYRE_R + 0.05), 0.05, M["black"], root, 10)
    box("transfer", (0.0, 0, 0.85), (0.6, 0.55, 0.4), M["black"], root, 0.03)

    # long gap between the axles: fuel tank (left), battery + tool boxes (right), air tanks
    cyl("fuel_tank", (0.9, 1.0, 1.0), 0.3, 1.5, "X", M["camo"], root, 28)
    for k, x in enumerate((0.3, 1.5)):
        box(f"fuel_strap{k}", (x, 1.0, 1.0), (0.05, 0.62, 0.63), M["black"], root, 0.005)
    box("battery", (1.0, -1.0, 1.0), (0.9, 0.42, 0.55), M["camo"], root, 0.02)
    box("toolbox", (-0.4, -1.0, 1.0), (0.9, 0.42, 0.5), M["camo"], root, 0.02)
    for k, x in enumerate((-0.6, -0.2)):
        cyl(f"air_tank{k}", (x, 0.95, 0.95), 0.13, 0.32, "X", M["black"], root, 16)
    # rear: bumper, pintle, mud flaps, lights
    box("rear_bumper", (MOUNT[1] + 0.05, 0, 0.88), (0.14, 2.3, 0.16), M["black"], root, 0.01)
    cyl("pintle", (MOUNT[1] - 0.05, 0, 0.88), 0.07, 0.16, "X", M["steel"], root, 12)
    for s in (-1, 1):
        box(f"mudflap{s}", (AX[2] - TYRE_R - 0.12, s * TRACK / 2, 0.55), (0.02, 0.42, 0.6), M["black"], root, 0.005)
        box(f"taillight{s}", (MOUNT[1] - 0.02, s * 1.0, 0.95), (0.05, 0.24, 0.1), M["red"], root, 0.008)

    build_cab(root, M)


def build_cab(root, M):
    cab = node("Cab", (0, 0, 0), root)
    xf, xb = FRONT - 0.3, FRONT - 2.25  # cab face, back wall
    hw, zt = 1.2, 3.02
    # tall flat cab: face leans back a little, rounded vertical corners, roof slightly crowned
    prof = [(xf, 1.2), (xf, 2.05), (xf - 0.12, zt - 0.06), (xf - 0.16, zt)]
    pts = []
    for x, z in prof:
        for s in (-1, 1):
            pts += [(x, s * (hw - 0.1), z), (x - 0.1, s * hw, z)]
    pts += [(xb, s * hw, z) for s in (-1, 1) for z in (1.2, zt)]
    hull("cab_shell", pts, M["camo"], cab, 0.03)
    # big windscreen (two panes), door glass with quarter light, door seams and handles
    for s in (-1, 1):
        hull(f"windscreen{s}", [(xf + 0.012 - t * 0.12, s * y, 2.12 + t * 0.72) for t in (0, 1) for y in (0.03, hw - 0.14)], M["glass"], cab, 0.0)
        hull(f"door_glass{s}", [(x, s * (hw + 0.005), z) for x in (xf - 0.32, xf - 1.05) for z in (2.1, 2.8)], M["glass"], cab, 0.0)
        hull(f"rear_glass{s}", [(x, s * (hw + 0.005), z) for x in (xf - 1.15, xf - 1.55) for z in (2.15, 2.8)], M["glass"], cab, 0.0)
        box(f"door_seam{s}", (xf - 1.1, s * (hw + 0.006), 1.75), (0.02, 0.01, 1.4), M["black"], cab, 0.0)
        box(f"handle{s}", (xf - 0.98, s * (hw + 0.02), 1.98), (0.14, 0.02, 0.03), M["black"], cab, 0.0)
        # star roundel on the door (game marking stays a small red block at sprite size)
        box(f"door_star{s}", (xf - 0.65, s * (hw + 0.006), 1.95), (0.14, 0.005, 0.14), M["red"], cab, 0.0)
        # mirrors on long arms + small convex mirror
        tube_between(f"mirror_arm{s}", (xf - 0.15, s * hw, 2.55), (xf + 0.05, s * (hw + 0.4), 2.7), 0.018, M["black"], cab, 6)
        box(f"mirror{s}", (xf + 0.05, s * (hw + 0.43), 2.5), (0.05, 0.22, 0.42), M["black"], cab, 0.01)
        cyl(f"convex{s}", (xf + 0.1, s * (hw + 0.2), 2.3), 0.07, 0.03, "X", M["black"], cab, 12)
        # black wheel arch flare over the front wheel, ladder step
        hull(f"arch{s}", [(AX[0] + dx, s * (hw + dy), z) for dx in (-0.8, 0.8) for dy in (-0.3, 0.06) for z in (1.32, 1.42)] + [(AX[0] + dx, s * (hw + 0.06), 0.95) for dx in (-0.95, 0.95)], M["black"], cab, 0.02)
        for k in range(2):
            box(f"step{s}{k}", (xf - 1.3, s * (hw - 0.1), 0.6 + k * 0.3), (0.42, 0.24, 0.035), M["black"], cab, 0.0)
        # bumper lamps: square headlamp, amber indicator, yellow fog lamp below
        box(f"headlamp{s}", (FRONT - 0.04, s * 0.78, 1.0), (0.04, 0.3, 0.2), M["lamp"], cab, 0.01)
        box(f"amber{s}", (FRONT - 0.04, s * 1.02, 1.0), (0.04, 0.09, 0.18), M["amber"], cab, 0.005)
        box(f"fog{s}", (FRONT - 0.02, s * 0.45, 0.7), (0.06, 0.26, 0.14), M["fog"], cab, 0.01)
    # grille: horizontal slats, logo disc and badge
    box("grille", (xf + 0.008, 0, 1.6), (0.02, 1.5, 0.5), M["black"], cab, 0.0)
    for k in range(5):
        box(f"slat{k}", (xf + 0.02, 0, 1.4 + k * 0.1), (0.02, 1.46, 0.04), M["camo"], cab, 0.0)
    cyl("logo", (xf + 0.02, 0.25, 1.98), 0.07, 0.02, "X", M["lamp"], cab, 16)
    box("badge", (xf + 0.02, 0.25, 1.86), (0.01, 0.34, 0.06), M["lamp"], cab, 0.0)
    # sun visor: dark brown fairing over the roof front edge
    hull("visor", [(x, s * (hw + 0.02), z) for s in (-1, 1) for x, z in ((xf + 0.12, zt + 0.1), (xf - 0.1, zt + 0.27), (xf - 0.75, zt + 0.27), (xf - 0.75, zt), (xf - 0.05, zt - 0.05))], M["visor"], cab, 0.04)
    # bumper and brush guard: black tubes standing ahead of the grille
    box("bumper", (FRONT - 0.15, 0, 1.0), (0.24, WIDTH - 0.05, 0.3), M["black"], cab, 0.015)
    box("plate", (FRONT - 0.02, 0, 0.82), (0.01, 0.44, 0.12), M["plate"], cab, 0.0)
    gx = xf + 0.25
    for y in (-1.0, -0.42, 0.42, 1.0):
        tube_between(f"guard_post{y}", (FRONT - 0.04, y, 1.15), (gx, y, 2.05), 0.04, M["black"], cab, 10)
    for z in (1.45, 1.8, 2.05):
        tube_between(f"guard_bar{z}", (gx, -1.0, z), (gx, 1.0, z), 0.03, M["black"], cab, 10)
    for s in (-1, 1):
        tube_between(f"guard_corner{s}", (gx, s * 1.0, 2.05), (gx - 0.25, s * 1.15, 1.8), 0.03, M["black"], cab, 10)
    cyl("tow_hook", (FRONT + 0.0, 0.62, 0.78), 0.05, 0.1, "X", M["steel"], cab, 10)
    # behind the cab: spare wheel upright on its carrier, air intake, exhaust
    cyl("spare", (xb - 0.32, 0.3, 1.25 + TYRE_R), TYRE_R, TYRE_W, "X", M["tyre"], cab, 40)
    cyl("spare_rim", (xb - 0.12, 0.3, 1.25 + TYRE_R), TYRE_R * 0.55, 0.04, "X", M["black"], cab, 28)
    box("spare_carrier", (xb - 0.35, 0.3, 1.3), (0.5, 1.4, 0.1), M["black"], cab, 0.01)
    box("intake", (xb - 0.15, -0.95, 2.35), (0.25, 0.32, 1.0), M["camo"], cab, 0.03)
    cyl("intake_cap", (xb - 0.15, -0.95, 2.92), 0.13, 0.12, "Z", M["black"], cab, 16)
    cyl("exhaust", (xb - 0.5, -0.5, 2.1), 0.07, 1.8, "Z", M["black"], cab, 14)


def build_body(root, M):
    """Cargo bed: deck on bearers, drop sides with a louvred top band and stakes, canvas tarpaulin (PLA pixel camo)
    over 6 bows, tied down along the sides, rear ladder."""
    body = node("Body", (0, 0, 0), root)
    xf, xr, z0 = MOUNT
    hw = WIDTH / 2
    box("bearers", ((xf + xr) / 2, 0, z0 + 0.07), (xf - xr - 0.1, 2.0, 0.14), M["black"], body, 0.01)
    box("deck", ((xf + xr) / 2, 0, z0 + 0.18), (xf - xr, WIDTH, 0.08), M["camo"], body, 0.01)
    zs, zt = z0 + 0.22, z0 + 0.22 + 0.65
    for s in (-1, 1):
        box(f"side{s}", ((xf + xr) / 2, s * (hw - 0.02), (zs + zt) / 2), (xf - xr, 0.04, zt - zs), M["camo"], body, 0.01)
        # louvred top band: dark slots between the stakes
        for k in range(30):
            x = xr + 0.2 + (k + 0.5) * (xf - xr - 0.4) / 30
            box(f"louvre{s}{k}", (x, s * (hw + 0.004), zt - 0.14), (0.12, 0.01, 0.12), M["black"], body, 0.0)
        for z in (zs + 0.12, zt - 0.03):
            box(f"rib{s}{z:.2f}", ((xf + xr) / 2, s * (hw + 0.006), z), (xf - xr - 0.06, 0.03, 0.035), M["camo"], body, 0.006)
        for k in range(7):
            x = xr + 0.08 + k * (xf - xr - 0.16) / 6
            box(f"stake{s}{k}", (x, s * (hw + 0.014), (zs + zt) / 2), (0.07, 0.03, zt - zs), M["black"], body, 0.006)
    box("headboard", (xf - 0.03, 0, (zs + zt + 0.3) / 2), (0.06, WIDTH, zt + 0.3 - zs), M["camo"], body, 0.01)
    box("tailgate", (xr + 0.02, 0, (zs + zt) / 2), (0.04, WIDTH, zt - zs), M["camo"], body, 0.01)
    for k in range(4):  # rear ladder
        box(f"ladder{k}", (xr - 0.06, 0.6, z0 - 0.15 - k * 0.22), (0.04, 0.4, 0.03), M["black"], body, 0.0)
    for y in (0.4, 0.8):
        box(f"ladder_rail{y}", (xr - 0.06, y, z0 - 0.48), (0.03, 0.03, 0.75), M["black"], body, 0.0)
    # canvas tarpaulin: rounded top edges, darker straps over the bows, tie-down ropes, rolled rear flap
    ztop = 3.2
    tw = hw - 0.01
    prof = [(tw, zt - 0.05), (tw, ztop - 0.25), (tw - 0.07, ztop - 0.08), (tw - 0.22, ztop)]
    prof += [(-y, z) for y, z in reversed(prof)]
    hull("tarp", [(x, y, z) for x in (xf + 0.01, xr - 0.01) for y, z in prof], M["canvas"], body, 0.05)
    for k in range(6):
        x = xr + 0.25 + k * (xf - xr - 0.5) / 5
        hull(f"bow{k}", [(x + dx, y * 1.006, z + 0.006) for dx in (-0.035, 0.035) for y, z in prof], M["black"], body, 0.0)
    for s in (-1, 1):
        for k in range(12):
            x = xr + 0.2 + k * (xf - xr - 0.4) / 11
            box(f"tie{s}{k}", (x, s * (tw + 0.012), zt + 0.05), (0.02, 0.01, 0.22), M["black"], body, 0.0)
    cyl("flap_roll", (xr - 0.04, 0, zt + 0.12), 0.06, WIDTH - 0.2, "Y", M["canvas"], body, 14)
    return body


if __name__ == "__main__":
    render_modular("truck-shacman-china", build_chassis, {"body": build_body}, mats, SAMPLES, PREVIEW, pivot=PIVOT)

"""
SAMP/T NG air-defence system (Europe's air-defence vehicle in the game), modelled from scratch after photos of the
launcher on its 8 x 8 truck: a forward-control cab with a split windscreen and roof hatch, four axles (two steered at the
front, two at the rear), equipment lockers and the power unit on the chassis, stabiliser jacks at the four corners, and
at the rear the launcher frame with eight round Aster canisters in two rows of four, erected vertical on its hydraulic
rams. About 12 m long. NATO green-grey paint; Europe's purple identity band on the cab doors and the canister tops.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/mantis_sampt_sheet.py

Writes ui/public/sprites/mantis-sampt.png (32 headings, vehiclekit sheet contract). Env: SAMPT_PREVIEW=<file.png>
(+ SAMPT_DIR=<0..31>), SAMPT_SAMPLES=<n> (default 32).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehiclekit as vk  # noqa: E402  (infrastructure only)

LENGTH = 12.0
# Width stretch, set (with the game length in MantisSheet.ts) so the vehicle is real proportions (1.0 = no squeeze), 1.2 tanks long.
WIDTH_SCALE = float(os.environ.get("MANTIS_WS", "1.0"))
TEAM = "#6532d6"


def build(root):
    green = vk.mat("green", "#525c48", rough=0.74)
    green_dk = vk.mat("green_dk", "#434c3b", rough=0.78)
    can = vk.mat("canister", "#5b6550", rough=0.7)
    steel = vk.mat("steel", "#77786f", rough=0.4, metal=0.8)
    dark = vk.mat("dark", "#2b2c28", rough=0.6)
    rubber = vk.mat("rubber", "#1c1b19", rough=0.92)
    rim = vk.mat("rim", "#5d6450", rough=0.5, metal=0.3)
    glass = vk.mat("glass", "#22303a", rough=0.06, metal=0.3, glass=True)
    team = vk.mat("team", TEAM, rough=0.6)
    lamp = vk.mat("lamp", "#e6e2d0", rough=0.2)
    chrome = vk.mat("chrome", "#c8c8c4", rough=0.2, metal=1.0, grime=False)

    # chassis rails and the four axles
    for s in (-1, 1):
        vk.box(f"rail{s}", (0.2, s * 0.48, 1.0), (10.6, 0.14, 0.32), dark, root, 0.005)
    for x in (4.7, 3.3, -2.3, -3.7):
        for s in (-1, 1):
            vk.wheel(f"w{x}{s}", x, s * 1.12, 0.6, 0.6, 0.48, rubber, rim, steel, root, s)
        vk.cyl(f"axle{x}", (x, 0, 0.6), 0.09, 2.0, "Y", dark, root, 12)

    # forward-control cab
    vk.hull("cab", [(x, s * 1.25, z) for s in (-1, 1) for x, z in ((5.95, 1.1), (6.05, 2.2), (5.75, 3.1), (4.1, 1.1), (4.1, 3.1))], green, root, 0.035)
    vk.box("cab_roof", (4.95, 0, 3.12), (1.7, 2.4, 0.06), green_dk, root)
    vk.box("roof_hatch", (4.7, -0.4, 3.18), (0.6, 0.6, 0.06), green_dk, root)
    for s in (-1, 1):
        vk.hull(f"windscreen{s}", [(5.99, s * 0.06, 2.3), (5.99, s * 1.12, 2.3), (5.8, s * 0.06, 2.95), (5.8, s * 1.12, 2.95)], glass, root, 0.0)
        vk.box(f"door{s}", (4.9, s * 1.255, 2.05), (1.0, 0.02, 1.4), green_dk, root, 0.0)
        vk.box(f"door_glass{s}", (5.0, s * 1.265, 2.55), (0.7, 0.02, 0.45), glass, root, 0.0)
        vk.box(f"door_band{s}", (4.9, s * 1.27, 1.6), (0.9, 0.02, 0.14), team, root, 0.0)
        vk.box(f"mirror{s}", (5.85, s * 1.45, 2.6), (0.06, 0.08, 0.38), dark, root, 0.0)
        vk.box(f"lamp{s}", (6.02, s * 0.95, 1.45), (0.04, 0.26, 0.14), lamp, root, 0.0)
        vk.box(f"step{s}", (5.0, s * 1.3, 1.0), (0.7, 0.2, 0.06), steel, root)
        for x0, x1 in ((5.25, 2.75), (-1.6, -4.4)):
            vk.hull(f"mudguard{s}{x0}", [(x, s * w, z) for w in (0.88, 1.4) for x, z in ((x0, 1.25), (x1, 1.25), (x0 - 0.1, 1.33), (x1 + 0.1, 1.33))], green, root, 0.01)
    vk.box("bumper", (6.1, 0, 0.98), (0.22, 2.5, 0.28), steel, root)
    vk.box("grille", (6.0, 0, 1.4), (0.03, 1.2, 0.35), dark, root, 0.0)

    # chassis equipment: power unit, lockers, exhaust, spare wheel
    vk.box("power_unit", (2.4, 0, 1.95), (1.6, 2.3, 1.5), green, root, 0.03)
    for k in range(6):
        vk.box(f"pu_louvre{k}", (2.4, 1.155, 1.45 + k * 0.17), (1.1, 0.02, 0.06), dark, root, 0.0)
        vk.box(f"pu_louvre_r{k}", (2.4, -1.155, 1.45 + k * 0.17), (1.1, 0.02, 0.06), dark, root, 0.0)
    vk.cyl("exhaust", (3.35, 1.0, 3.0), 0.07, 1.1, "Z", steel, root, 12)
    for s in (-1, 1):
        vk.box(f"locker{s}", (0.4, s * 1.05, 1.5), (2.2, 0.4, 0.75), green_dk, root, 0.02)
        for k in range(2):
            vk.box(f"locker_door{s}{k}", (-0.1 + k * 1.0, s * 1.26, 1.5), (0.9, 0.02, 0.6), green, root, 0.0)
    vk.box("deck", (-1.8, 0, 1.28), (5.6, 2.45, 0.22), green, root, 0.02)
    vk.cyl("spare", (1.2, 0, 1.55), 0.58, 0.45, "Z", rubber, root, 28)

    # stabiliser jacks at the four corners
    for x in (3.9, -4.9):
        for s in (-1, 1):
            vk.box(f"jack_arm{x}{s}", (x, s * 1.45, 1.1), (0.24, 0.6, 0.2), steel, root)
            vk.cyl(f"jack{x}{s}", (x, s * 1.72, 0.6), 0.08, 1.0, "Z", steel, root, 12)
            vk.cyl(f"jack_pad{x}{s}", (x, s * 1.72, 0.07), 0.22, 0.08, "Z", dark, root, 16)

    # launcher: frame hinged at the rear, eight round canisters in two rows of four, erected vertical
    base_x = -4.65
    vk.box("hinge", (base_x, 0, 1.5), (0.4, 2.4, 0.3), steel, root)
    # open lifting frame behind the pack: two posts and cross braces (the canisters show through)
    for s in (-1, 1):
        vk.box(f"post{s}", (base_x - 0.05, s * 1.18, 3.95), (0.16, 0.16, 4.9), green_dk, root, 0.01)
    for z in (1.9, 3.95, 6.1000000000000005):
        vk.box(f"brace{z}", (base_x - 0.05, 0, z), (0.12, 2.36, 0.14), green_dk, root, 0.005)
    for row, x in enumerate((base_x + 0.32, base_x + 0.9)):
        for k in range(4):
            y = -0.84 + k * 0.56
            vk.cyl(f"can{row}{k}", (x, y, 3.95), 0.26, 4.7, "Z", can, root, 28)
            for z in (2.0, 3.6, 5.2):
                vk.cyl(f"can_ring{row}{k}{z}", (x, y, z), 0.275, 0.08, "Z", green_dk, root, 28)
            vk.cyl(f"can_band{row}{k}", (x, y, 6.05), 0.278, 0.18, "Z", team, root, 28)
            vk.cyl(f"can_cap{row}{k}", (x, y, 6.33), 0.25, 0.06, "Z", dark, root, 28)
    vk.box("frame_top", (base_x + 0.6, 0, 6.45), (1.3, 2.5, 0.12), green_dk, root, 0.01)
    # hydraulic rams from the deck to the frame
    for s in (-1, 1):
        vk.tube_between(f"ram{s}", (-2.4, s * 0.8, 1.4), (base_x + 0.1, s * 0.8, 4.3), 0.1, steel, root)
        vk.tube_between(f"ram_rod{s}", (-3.4, s * 0.8, 2.6), (base_x + 0.1, s * 0.8, 4.3), 0.06, chrome, root)
    vk.cyl("antenna", (4.3, 0.9, 3.9), 0.014, 1.5, "Z", dark, root, 6)


if __name__ == "__main__":
    vk.render_sheet("mantis-sampt", build, LENGTH, centre_x=0.6, samples=int(os.environ.get("SAMPT_SAMPLES", "32")),
                    preview=os.environ.get("SAMPT_PREVIEW"), width_scale=WIDTH_SCALE, front=(3.8, 1.25, 1.3, 1.0), preview_dir=int(os.environ.get("SAMPT_DIR", "4")))

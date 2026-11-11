"""
S-400 Triumf launcher (Russia's air-defence vehicle in the game), modelled from scratch after photos of the 5P85TE2:
a BAZ-64022 6 x 6 tractor (long bonnetless cab with four doors, sloped windscreen, roof light bar, three axles, fuel
tanks and battery boxes on the frame) towing the semitrailer launcher: its gooseneck, the generator and equipment
cabinets at the front, two rear axle pairs, outrigger jacks, and the four long round transport-launch tubes in a 2 x 2
pack erected vertical at the rear on their lifting frame. About 16 m long. Russian three-tone camouflage (green, sand,
black); Russia's red identity band on the cab doors and the tube tops.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/mantis_s400_sheet.py

Writes ui/public/sprites/mantis-s400.png (32 headings, vehiclekit sheet contract). Env: S400_PREVIEW=<file.png>
(+ S400_DIR=<0..31>), S400_SAMPLES=<n> (default 32).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehiclekit as vk  # noqa: E402  (infrastructure only)

LENGTH = 16.0
# Width stretch, set (with the game length in MantisSheet.ts) so the vehicle is real proportions (1.0 = no squeeze), 1.2 tanks long.
WIDTH_SCALE = float(os.environ.get("MANTIS_WS", "1.0"))
TEAM = "#d22b2b"


def build(root):
    camo = vk.camo_mat("camo", ["#4e5a36", "#4e5a36", "#8a8460", "#2c2e26"], scale=0.45)
    green = vk.mat("green", "#4e5a36", rough=0.75)
    green_dk = vk.mat("green_dk", "#3e472b", rough=0.78)
    tube = vk.mat("tube", "#56623c", rough=0.7)
    steel = vk.mat("steel", "#77786f", rough=0.4, metal=0.8)
    dark = vk.mat("dark", "#2b2c28", rough=0.6)
    rubber = vk.mat("rubber", "#1c1b19", rough=0.92)
    rim = vk.mat("rim", "#56603c", rough=0.5, metal=0.3)
    glass = vk.mat("glass", "#22303a", rough=0.06, metal=0.3, glass=True)
    team = vk.mat("team", TEAM, rough=0.6)
    lamp = vk.mat("lamp", "#e6e2d0", rough=0.2)
    chrome = vk.mat("chrome", "#c8c8c4", rough=0.2, metal=1.0, grime=False)

    # ---- BAZ-64022 tractor
    for s in (-1, 1):
        vk.box(f"rail{s}", (4.6, s * 0.48, 1.0), (6.8, 0.14, 0.32), dark, root, 0.005)
    for x in (6.9, 3.9, 2.55):
        for s in (-1, 1):
            vk.wheel(f"tw{x}{s}", x, s * 1.13, 0.66, 0.66, 0.52, rubber, rim, steel, root, s)
        vk.cyl(f"axle{x}", (x, 0, 0.66), 0.09, 2.0, "Y", dark, root, 12)
    vk.hull("cab", [(x, s * 1.27, z) for s in (-1, 1) for x, z in ((8.1, 1.15), (8.1, 2.0), (7.8, 3.05), (5.6, 1.15), (5.6, 3.05))], camo, root, 0.035)
    vk.box("cab_roof", (6.7, 0, 3.07), (2.2, 2.45, 0.06), green_dk, root)
    vk.box("light_bar", (7.6, 0, 3.15), (0.2, 1.8, 0.12), dark, root)
    vk.hull("windscreen", [(8.08, s * 1.15, z) for s in (-1, 1) for z in (2.1,)] + [(7.82, s * 1.15, 2.95) for s in (-1, 1)], glass, root, 0.0)
    vk.box("grille", (8.12, 0, 1.55), (0.03, 1.4, 0.5), dark, root, 0.0)
    for k in range(5):
        vk.box(f"grille_bar{k}", (8.14, 0, 1.35 + k * 0.1), (0.02, 1.35, 0.03), steel, root, 0.0)
    vk.box("bumper", (8.25, 0, 1.0), (0.22, 2.5, 0.3), steel, root)
    for s in (-1, 1):
        for k, x in enumerate((7.25, 6.15)):
            vk.box(f"door{s}{k}", (x, s * 1.275, 2.1), (0.95, 0.02, 1.5), green_dk, root, 0.0)
            vk.box(f"door_glass{s}{k}", (x, s * 1.285, 2.62), (0.7, 0.02, 0.45), glass, root, 0.0)
        vk.box(f"door_band{s}", (6.7, s * 1.29, 1.6), (2.0, 0.02, 0.14), team, root, 0.0)
        vk.box(f"lamp{s}", (8.12, s * 1.0, 1.95), (0.04, 0.24, 0.14), lamp, root, 0.0)
        vk.box(f"mirror{s}", (7.95, s * 1.48, 2.6), (0.06, 0.08, 0.38), dark, root, 0.0)
        vk.cyl(f"fuel{s}", (4.9, s * 1.05, 1.2), 0.33, 1.2, "X", green_dk, root, 20)
        vk.box(f"battery{s}", (4.0, s * 1.05, 1.55), (0.6, 0.45, 0.4), dark, root)
        vk.hull(f"fender{s}", [(x, s * w, z) for w in (0.9, 1.42) for x, z in ((8.0, 1.35), (6.2, 1.35), (7.9, 1.43), (6.3, 1.43))], camo, root, 0.01)
        vk.hull(f"rear_fender{s}", [(x, s * w, z) for w in (0.9, 1.42) for x, z in ((4.7, 1.35), (1.8, 1.35), (4.6, 1.43), (1.9, 1.43))], green, root, 0.01)
    vk.cyl("exhaust", (5.45, -0.95, 3.0), 0.08, 1.3, "Z", steel, root, 12)
    vk.box("fifth_wheel", (3.2, 0, 1.3), (1.1, 1.3, 0.12), steel, root)

    # ---- 5P85TE2 semitrailer
    vk.box("gooseneck", (3.0, 0, 1.75), (2.6, 2.4, 0.55), camo, root, 0.02)
    vk.box("deck", (-2.6, 0, 1.35), (9.0, 2.55, 0.35), camo, root, 0.02)
    for x in (-4.6, -6.0):
        for s in (-1, 1):
            vk.wheel(f"rw{x}{s}", x, s * 1.13, 0.6, 0.6, 0.48, rubber, rim, steel, root, s)
    vk.box("generator", (2.6, 0, 2.6), (1.6, 2.3, 1.2), green, root, 0.03)
    for k in range(5):
        vk.box(f"gen_louvre{k}", (2.6, 1.155, 2.15 + k * 0.18), (1.1, 0.02, 0.07), dark, root, 0.0)
    for s in (-1, 1):
        vk.box(f"cabinet{s}", (0.2, s * 1.05, 1.95), (2.4, 0.45, 0.9), green_dk, root, 0.02)
        for k in range(3):
            vk.box(f"cab_door{s}{k}", (-0.6 + k * 0.8, s * 1.28, 1.95), (0.7, 0.02, 0.75), green, root, 0.0)
    for x in (1.6, -6.9):
        for s in (-1, 1):
            vk.box(f"outrigger{x}{s}", (x, s * 1.6, 1.2), (0.26, 0.8, 0.2), steel, root)
            vk.cyl(f"jack{x}{s}", (x, s * 1.95, 0.68), 0.08, 1.05, "Z", steel, root, 12)
            vk.cyl(f"pad{x}{s}", (x, s * 1.95, 0.08), 0.24, 0.08, "Z", dark, root, 16)

    # ---- four long tubes erected vertical on the lifting frame at the rear
    bx = -7.15
    vk.box("hinge", (bx, 0, 1.6), (0.45, 2.4, 0.35), steel, root)
    # open lifting frame behind the pack: two posts and cross braces (the canisters show through)
    for s in (-1, 1):
        vk.box(f"post{s}", (bx - 0.05, s * 1.0, 5.15), (0.16, 0.16, 7.1), green_dk, root, 0.01)
    for z in (2.0, 5.15, 8.4):
        vk.box(f"brace{z}", (bx - 0.05, 0, z), (0.12, 2.0, 0.14), green_dk, root, 0.005)
    for row, x in enumerate((bx + 0.45, bx + 1.25)):
        for k, y in enumerate((-0.42, 0.42)):
            vk.cyl(f"tube{row}{k}", (x, y, 5.25), 0.38, 7.0, "Z", tube, root, 32)
            for z in (2.3, 4.2, 6.1, 8.0):
                vk.cyl(f"tube_ring{row}{k}{z}", (x, y, z), 0.4, 0.1, "Z", green_dk, root, 32)
            vk.cyl(f"tube_band{row}{k}", (x, y, 8.4), 0.402, 0.22, "Z", team, root, 32)
            vk.cyl(f"tube_cap{row}{k}", (x, y, 8.8), 0.36, 0.1, "Z", dark, root, 32)
    for z in (3.0, 7.6):
        vk.box(f"clamp{z}", (bx + 0.85, 0, z), (1.75, 1.75, 0.14), steel, root, 0.01)
    for s in (-1, 1):
        vk.tube_between(f"ram{s}", (-4.0, s * 0.95, 1.5), (bx + 0.1, s * 0.95, 5.0), 0.12, steel, root)
        vk.tube_between(f"ram_rod{s}", (-5.3, s * 0.95, 3.0), (bx + 0.1, s * 0.95, 5.0), 0.07, chrome, root)
    vk.cyl("antenna", (6.2, 0.9, 3.8), 0.014, 1.5, "Z", dark, root, 6)


if __name__ == "__main__":
    vk.render_sheet("mantis-s400", build, LENGTH, centre_x=0.5, samples=int(os.environ.get("S400_SAMPLES", "32")),
                    preview=os.environ.get("S400_PREVIEW"), width_scale=WIDTH_SCALE, front=(5.2, 1.25, 1.3, 1.0), preview_dir=int(os.environ.get("S400_DIR", "4")))

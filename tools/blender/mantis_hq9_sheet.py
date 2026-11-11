"""
HQ-9 launcher (China's air-defence vehicle in the game), modelled from scratch after photos of the TEL on its Taian
TAS5501 8 x 8 chassis: a flat-faced forward-control cab over the front axles (big rectangular windscreen, four doors,
roof hatch and air intake), two front and two rear axles far apart, a tall power module and armoured side lockers
behind the cab, stabiliser jacks, and the four round metal canisters in a square erected vertical at the rear on their
lifting frame. About 13 m long. PLA woodland digital camouflage; China's yellow identity band on the cab doors and the
canister tops.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/mantis_hq9_sheet.py

Writes ui/public/sprites/mantis-hq9.png (32 headings, vehiclekit sheet contract). Env: HQ9_PREVIEW=<file.png>
(+ HQ9_DIR=<0..31>), HQ9_SAMPLES=<n> (default 32).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehiclekit as vk  # noqa: E402  (infrastructure only)

LENGTH = 13.0
# Width stretch, set (with the game length in MantisSheet.ts) so the vehicle is real proportions (1.0 = no squeeze), 1.2 tanks long.
WIDTH_SCALE = float(os.environ.get("MANTIS_WS", "1.0"))
TEAM = "#e8b10a"


def build(root):
    camo = vk.camo_mat("digital", ["#56694a", "#56694a", "#2f3f2a", "#8f8d62"], digital=True)
    green = vk.mat("green", "#56694a", rough=0.75)
    green_dk = vk.mat("green_dk", "#3f4d36", rough=0.78)
    metal = vk.mat("canister", "#8b908c", rough=0.45, metal=0.6)
    steel = vk.mat("steel", "#77786f", rough=0.4, metal=0.8)
    dark = vk.mat("dark", "#2a2c28", rough=0.6)
    rubber = vk.mat("rubber", "#1c1b19", rough=0.92)
    rim = vk.mat("rim", "#5a6650", rough=0.5, metal=0.3)
    glass = vk.mat("glass", "#22303a", rough=0.06, metal=0.3, glass=True)
    team = vk.mat("team", TEAM, rough=0.6)
    lamp = vk.mat("lamp", "#e6e2d0", rough=0.2)
    chrome = vk.mat("chrome", "#c8c8c4", rough=0.2, metal=1.0, grime=False)

    for s in (-1, 1):
        vk.box(f"rail{s}", (0.3, s * 0.5, 1.0), (11.6, 0.14, 0.32), dark, root, 0.005)
    for x in (5.0, 3.6, -2.4, -3.8):
        for s in (-1, 1):
            vk.wheel(f"w{x}{s}", x, s * 1.15, 0.65, 0.65, 0.52, rubber, rim, steel, root, s)
        vk.cyl(f"axle{x}", (x, 0, 0.65), 0.09, 2.0, "Y", dark, root, 12)

    # flat-faced forward-control cab
    vk.box("cab", (5.05, 0, 2.2), (2.3, 2.6, 2.1), camo, root, 0.04)
    vk.box("windscreen", (6.21, 0, 2.7), (0.03, 2.2, 0.75), glass, root, 0.0)
    vk.box("windscreen_bar", (6.225, 0, 2.7), (0.02, 0.07, 0.75), green_dk, root, 0.0)
    vk.box("cab_face", (6.21, 0, 1.75), (0.03, 2.4, 0.9), green, root, 0.0)
    for k in range(4):
        vk.box(f"vent{k}", (6.23, 0, 1.5 + k * 0.12), (0.02, 1.0, 0.05), dark, root, 0.0)
    vk.box("bumper", (6.35, 0, 1.0), (0.22, 2.6, 0.3), steel, root)
    vk.box("roof_hatch", (4.7, 0.4, 3.3), (0.6, 0.6, 0.06), green_dk, root)
    vk.box("intake", (4.3, -0.9, 3.45), (0.5, 0.4, 0.4), green_dk, root)
    for s in (-1, 1):
        for k, x in enumerate((5.55, 4.45)):
            vk.box(f"door{s}{k}", (x, s * 1.305, 2.25), (0.95, 0.02, 1.5), green_dk, root, 0.0)
            vk.box(f"door_glass{s}{k}", (x, s * 1.315, 2.75), (0.7, 0.02, 0.45), glass, root, 0.0)
        vk.box(f"door_band{s}", (5.0, s * 1.32, 1.7), (2.0, 0.02, 0.14), team, root, 0.0)
        vk.box(f"lamp{s}", (6.23, s * 1.05, 1.3), (0.03, 0.26, 0.16), lamp, root, 0.0)
        vk.box(f"mirror{s}", (6.1, s * 1.5, 2.8), (0.06, 0.08, 0.38), dark, root, 0.0)
        for x0, x1 in ((5.6, 2.9), (-1.7, -4.5)):
            vk.hull(f"mudguard{s}{x0}", [(x, s * w, z) for w in (0.9, 1.45) for x, z in ((x0, 1.35), (x1, 1.35), (x0 - 0.1, 1.43), (x1 + 0.1, 1.43))], green, root, 0.01)
    # tall power module and armoured lockers
    vk.box("power", (2.6, 0, 2.3), (1.6, 2.5, 2.1), camo, root, 0.03)
    for k in range(7):
        vk.box(f"power_louvre{k}", (2.6, 1.255, 1.6 + k * 0.2), (1.1, 0.02, 0.07), dark, root, 0.0)
        vk.box(f"power_louvre_r{k}", (2.6, -1.255, 1.6 + k * 0.2), (1.1, 0.02, 0.07), dark, root, 0.0)
    vk.cyl("exhaust", (3.3, 1.0, 3.7), 0.08, 0.9, "Z", steel, root, 12)
    for s in (-1, 1):
        vk.box(f"locker{s}", (0.2, s * 1.05, 1.75), (2.8, 0.5, 1.1), camo, root, 0.02)
        for k in range(3):
            vk.box(f"locker_door{s}{k}", (-0.7 + k * 0.9, s * 1.31, 1.75), (0.8, 0.02, 0.9), green_dk, root, 0.0)
    vk.box("deck", (-2.2, 0, 1.3), (5.2, 2.5, 0.24), green, root, 0.02)
    for x in (4.2, -5.0):
        for s in (-1, 1):
            vk.box(f"jack_arm{x}{s}", (x, s * 1.5, 1.1), (0.25, 0.6, 0.2), steel, root)
            vk.cyl(f"jack{x}{s}", (x, s * 1.78, 0.62), 0.08, 1.0, "Z", steel, root, 12)
            vk.cyl(f"pad{x}{s}", (x, s * 1.78, 0.07), 0.22, 0.08, "Z", dark, root, 16)

    # four round metal canisters in a square, erected vertical at the rear
    bx = -4.85
    vk.box("hinge", (bx, 0, 1.55), (0.4, 2.4, 0.3), steel, root)
    # open lifting frame behind the pack: two posts and cross braces (the canisters show through)
    for s in (-1, 1):
        vk.box(f"post{s}", (bx - 0.05, s * 0.95, 4.3), (0.16, 0.16, 5.6), green_dk, root, 0.01)
    for z in (1.9, 4.3, 6.8):
        vk.box(f"brace{z}", (bx - 0.05, 0, z), (0.12, 1.9, 0.14), green_dk, root, 0.005)
    for row, x in enumerate((bx + 0.42, bx + 1.18)):
        for k, y in enumerate((-0.4, 0.4)):
            vk.cyl(f"can{row}{k}", (x, y, 4.35), 0.35, 5.6, "Z", metal, root, 32)
            for z in (2.2, 3.7, 5.2, 6.6):
                vk.cyl(f"can_ring{row}{k}{z}", (x, y, z), 0.37, 0.09, "Z", steel, root, 32)
            vk.cyl(f"can_band{row}{k}", (x, y, 6.85), 0.372, 0.2, "Z", team, root, 32)
            vk.cyl(f"can_cap{row}{k}", (x, y, 7.2), 0.33, 0.08, "Z", dark, root, 32)
    for z in (2.8, 5.9):
        vk.box(f"clamp{z}", (bx + 0.8, 0, z), (1.65, 1.65, 0.14), green_dk, root, 0.01)
    for s in (-1, 1):
        vk.tube_between(f"ram{s}", (-2.4, s * 0.9, 1.45), (bx + 0.1, s * 0.9, 4.3), 0.11, steel, root)
        vk.tube_between(f"ram_rod{s}", (-3.5, s * 0.9, 2.7), (bx + 0.1, s * 0.9, 4.3), 0.065, chrome, root)
    vk.cyl("antenna", (4.0, 0.9, 4.0), 0.014, 1.4, "Z", dark, root, 6)


if __name__ == "__main__":
    vk.render_sheet("mantis-hq9", build, LENGTH, centre_x=0.7, samples=int(os.environ.get("HQ9_SAMPLES", "32")),
                    preview=os.environ.get("HQ9_PREVIEW"), width_scale=WIDTH_SCALE, front=(3.7, 1.25, 1.3, 1.0), preview_dir=int(os.environ.get("HQ9_DIR", "4")))

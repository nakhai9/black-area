"""
Patriot air-defence system (USA's air-defence vehicle in the game), modelled from scratch after photos of the M903
launching station: an M983 HEMTT 8 x 8 tractor (forward cab with flat windscreen, big square grille, steel bumper,
four axles in two pairs, fuel tank and air tanks on the frame, exhaust stack behind the cab) towing the semitrailer
launcher: outrigger jacks at the four corners, the electronic module and generator at the front of the deck, and the
four big square canisters in a 2 x 2 pack raised about 38 deg on their frame and hydraulic ram, pivoting at the rear.
Overall about 16 m long. Desert tan CARC paint; the USA's blue identity band on the cab doors and the canister ends.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/mantis_patriot_sheet.py

Writes ui/public/sprites/mantis-patriot.png (32 headings, vehiclekit sheet contract). Env: PATRIOT_PREVIEW=<file.png>
(+ PATRIOT_DIR=<0..31>), PATRIOT_SAMPLES=<n> (default 32).
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehiclekit as vk  # noqa: E402  (infrastructure only)

LENGTH = 16.0
TEAM = "#2f6fe0"
ELEV = math.radians(38)


def build(root):
    tan = vk.mat("tan", "#b29c6e", rough=0.75)
    tan_dk = vk.mat("tan_dk", "#9b875d", rough=0.78)
    can = vk.mat("canister", "#bfaa7c", rough=0.7)
    steel = vk.mat("steel", "#7a776e", rough=0.4, metal=0.8)
    dark = vk.mat("dark", "#2e2c27", rough=0.6)
    rubber = vk.mat("rubber", "#1c1b19", rough=0.92)
    rim = vk.mat("rim", "#8f8466", rough=0.5, metal=0.3)
    glass = vk.mat("glass", "#22303a", rough=0.06, metal=0.3, glass=True)
    team = vk.mat("team", TEAM, rough=0.6)
    lamp = vk.mat("lamp", "#e6e2d0", rough=0.2)

    # ---- HEMTT tractor: frame rails, cab forward over the first axle pair
    for s in (-1, 1):
        vk.box(f"rail{s}", (3.9, s * 0.45, 0.95), (7.8, 0.14, 0.32), dark, root, 0.005)
    for x in (7.15, 5.75, 2.25, 0.95):
        for s in (-1, 1):
            vk.wheel(f"tw{x}{s}", x, s * 1.12, 0.62, 0.62, 0.5, rubber, rim, steel, root, s)
        vk.cyl(f"axle{x}", (x, 0, 0.62), 0.09, 2.0, "Y", dark, root, 12)
    vk.box("cab", (6.55, 0, 2.1), (2.1, 2.45, 1.7), tan, root, 0.03)
    vk.hull("hood", [(x, s * 1.2, z) for s in (-1, 1) for x, z in ((7.6, 1.1), (7.6, 1.85), (7.0, 1.1), (7.0, 2.0))], tan, root, 0.02)
    vk.box("grille", (7.62, 0, 1.45), (0.04, 1.6, 0.6), dark, root, 0.0)
    for k in range(6):
        vk.box(f"grille_bar{k}", (7.645, 0, 1.2 + k * 0.1), (0.02, 1.55, 0.03), steel, root, 0.0)
    vk.box("bumper", (7.78, 0, 0.95), (0.25, 2.5, 0.3), steel, root)
    for s in (-1, 1):
        vk.box(f"lamp{s}", (7.66, s * 1.0, 1.8), (0.04, 0.22, 0.14), lamp, root, 0.0)
        vk.box(f"mirror{s}", (7.3, s * 1.42, 2.55), (0.06, 0.08, 0.35), dark, root, 0.0)
        vk.box(f"door{s}", (6.5, s * 1.226, 2.2), (1.0, 0.02, 1.1), tan_dk, root, 0.0)
        vk.box(f"door_glass{s}", (6.55, s * 1.235, 2.55), (0.7, 0.02, 0.45), glass, root, 0.0)
        vk.box(f"door_band{s}", (6.5, s * 1.24, 1.85), (0.9, 0.02, 0.12), team, root, 0.0)
        vk.box(f"step{s}", (6.6, s * 1.3, 1.05), (0.6, 0.2, 0.06), steel, root)
        vk.hull(f"fender{s}", [(x, s * w, z) for w in (0.85, 1.4) for x, z in ((7.6, 1.25), (5.2, 1.25), (7.5, 1.35), (5.3, 1.35))], tan, root, 0.01)
        vk.cyl(f"fuel{s}", (4.6, s * 1.05, 1.2), 0.32, 1.3, "X", tan_dk, root, 20)
        vk.cyl(f"air{s}", (3.6, s * 0.95, 1.0), 0.16, 0.8, "X", steel, root, 14)
    vk.box("windscreen", (7.61, 0, 2.55), (0.03, 2.1, 0.62), glass, root, 0.0)
    vk.box("windscreen_bar", (7.625, 0, 2.55), (0.02, 0.06, 0.62), tan, root, 0.0)
    vk.box("cab_roof_hatch", (6.4, 0.4, 2.98), (0.6, 0.6, 0.06), tan_dk, root)
    vk.cyl("exhaust", (5.35, -0.95, 2.6), 0.08, 1.4, "Z", steel, root, 12)
    vk.box("fifth_wheel", (1.6, 0, 1.2), (1.1, 1.3, 0.12), steel, root)

    # ---- M903 semitrailer: gooseneck over the fifth wheel, long deck, two rear axles, outriggers
    vk.box("gooseneck", (1.9, 0, 1.55), (2.2, 2.2, 0.5), tan, root)
    vk.box("deck", (-3.0, 0, 1.25), (8.6, 2.5, 0.35), tan, root, 0.02)
    for s in (-1, 1):
        vk.box(f"deck_side{s}", (-3.0, s * 1.26, 1.25), (8.6, 0.02, 0.3), tan_dk, root, 0.0)
    for x in (-5.3, -6.6):
        for s in (-1, 1):
            vk.wheel(f"rw{x}{s}", x, s * 1.12, 0.55, 0.55, 0.45, rubber, rim, steel, root, s)
    for x in (0.4, -7.1):
        for s in (-1, 1):
            vk.box(f"outrigger{x}{s}", (x, s * 1.6, 1.15), (0.25, 0.8, 0.2), steel, root)
            vk.cyl(f"jack{x}{s}", (x, s * 1.95, 0.65), 0.08, 1.0, "Z", steel, root, 12)
            vk.cyl(f"pad{x}{s}", (x, s * 1.95, 0.08), 0.22, 0.08, "Z", dark, root, 16)
    # electronic module and generator at the front of the deck
    vk.box("emu", (0.55, 0, 2.05), (1.3, 2.2, 1.3), tan, root, 0.03)
    for k in range(5):
        vk.box(f"emu_louvre{k}", (0.55, 1.105, 1.65 + k * 0.17), (0.9, 0.02, 0.06), dark, root, 0.0)
    vk.box("emu_door", (1.21, 0.4, 2.0), (0.02, 0.8, 1.0), tan_dk, root, 0.0)
    vk.box("generator", (-0.75, -0.5, 1.85), (1.0, 1.1, 0.9), tan_dk, root, 0.02)
    vk.cyl("antenna", (0.2, 0.9, 3.0), 0.015, 1.3, "Z", dark, root, 6)

    # ---- launcher: frame and 2 x 2 square canisters raised at the rear pivot
    pivot = vk.node("launcher", (-7.4, 0, 1.75), root, (0, -ELEV, 0))
    vk.box("cradle", (2.8, 0, -0.05), (5.6, 2.2, 0.16), steel, pivot)
    for i, y in enumerate((-0.5, 0.5)):
        for j, z in enumerate((0.47, 1.4)):
            vk.box(f"can{i}{j}", (2.75, y, z), (5.5, 0.9, 0.9), can, pivot, 0.03)
            for k in range(4):
                vk.box(f"can_rib{i}{j}{k}", (0.6 + k * 1.45, y, z), (0.08, 0.94, 0.94), tan_dk, pivot, 0.005)
            vk.box(f"can_cover{i}{j}", (5.52, y, z), (0.04, 0.8, 0.8), tan_dk, pivot, 0.0)
            vk.box(f"can_band{i}{j}", (5.3, y, z), (0.18, 0.92, 0.92), team, pivot, 0.0)
    for s in (-1, 1):
        vk.box(f"side_rail{s}", (2.75, s * 1.0, 0.9), (5.6, 0.05, 1.9), steel, pivot, 0.0)
    # hydraulic ram from the deck to the underside of the cradle
    base = Vector((-4.3, 0, 1.45))
    top = Vector((-7.4, 0, 1.75)) + Vector((math.cos(ELEV), 0, math.sin(ELEV))) * 2.6
    vk.tube_between("ram", base, top, 0.11, steel, root)
    vk.tube_between("ram_rod", base + (top - base) * 0.55, top, 0.07, vk.mat("chrome", "#c8c8c4", rough=0.2, metal=1.0, grime=False), root)


if __name__ == "__main__":
    vk.render_sheet("mantis-patriot", build, LENGTH, centre_x=0.0, samples=int(os.environ.get("PATRIOT_SAMPLES", "32")),
                    preview=os.environ.get("PATRIOT_PREVIEW"), width_scale=1.7, preview_dir=int(os.environ.get("PATRIOT_DIR", "4")))

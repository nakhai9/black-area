"""
PGZ-09 self-propelled anti-aircraft gun (China / Islamic nations' air-defence vehicle in the game), modelled from
scratch after photos and the published figures: about 7.2 m hull, 3.4 m wide, 4.1 m to the top of the search radar;
tracked chassis with six road wheels a side, drive sprocket at the front, idler at the rear, side skirts; sloped glacis
with the driver's hatch at front left, engine deck with grilles; a large welded turret in the middle carrying a 35 mm
cannon in an armoured pod on each side, a folding search-radar antenna on a mast at the turret rear, a tracking-radar
dish and an electro-optical sight box on the turret front, smoke-grenade launchers on the cheeks. Olive drab paint
with the Islamic nations' green identity band on the turret.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/mantis_pgz09_sheet.py

Writes ui/public/sprites/mantis-pgz09.png (32 headings, vehiclekit sheet contract). Env: PGZ_PREVIEW=<file.png>
(+ PGZ_DIR=<0..31>) renders one big frame only; PGZ_SAMPLES=<n> (default 32).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vehiclekit as vk  # noqa: E402  (infrastructure only: stage, camera, sheet, materials, primitives)

LENGTH = 7.6  # m, nose to the end of the gun-free hull (the barrels laid up do not lengthen it)
TEAM = "#1f9d4a"
GUN_ELEV = math.radians(35)


def build(root):
    olive = vk.mat("olive", "#5c6638", rough=0.72)
    olive_dk = vk.mat("olive_dk", "#4a5230", rough=0.75)
    panel = vk.mat("panel", "#424a2b", rough=0.8)
    steel = vk.mat("steel", "#6d6e66", rough=0.4, metal=0.8)
    gun = vk.mat("gun", "#2a2c2a", rough=0.4, metal=0.75)
    rubber = vk.mat("rubber", "#1b1b1a", rough=0.92)
    track = vk.mat("track", "#2b2a27", rough=0.7, metal=0.4)
    glass = vk.mat("glass", "#1d2a33", rough=0.06, metal=0.3, glass=True)
    radar = vk.mat("radar", "#6a7048", rough=0.6)
    team = vk.mat("team", TEAM, rough=0.6)

    # ---- running gear: tracks round six road wheels, sprocket front, idler rear, return rollers
    wx = [-2.45 + i * 0.98 for i in range(6)]
    for s in (-1, 1):
        y = s * 1.38
        loop = []
        for x, z, r in [(x, 0.4, 0.37) for x in wx] + [(3.0, 0.62, 0.3), (-3.25, 0.6, 0.28)]:
            for k in range(20):
                a = k / 20 * 2 * math.pi
                for yy in (y - 0.3, y + 0.3):
                    loop.append((x + (r + 0.07) * math.cos(a), yy, z + (r + 0.07) * math.sin(a)))
        vk.hull(f"track{s}", loop, track, root, 0.03)
        for i, x in enumerate(wx):
            vk.cyl(f"wheel{s}{i}", (x, y + s * 0.02, 0.4), 0.37, 0.56, "Y", rubber, root, 28)
            vk.cyl(f"rim{s}{i}", (x, y + s * 0.3, 0.4), 0.27, 0.03, "Y", steel, root, 24)
            vk.cyl(f"hub{s}{i}", (x, y + s * 0.33, 0.4), 0.09, 0.05, "Y", steel, root, 12)
        vk.cyl(f"sprocket{s}", (3.0, y, 0.62), 0.3, 0.58, "Y", steel, root, 20)
        vk.cyl(f"idler{s}", (-3.25, y, 0.6), 0.28, 0.58, "Y", steel, root, 20)
        for x in (-1.5, 0.5, 2.0):
            vk.cyl(f"return{s}{x}", (x, y, 1.0), 0.09, 0.5, "Y", steel, root, 12)
        # side skirt over the upper run of the track
        vk.box(f"skirt{s}", (-0.1, s * 1.7, 1.02), (6.7, 0.05, 0.42), olive, root)
        for k in range(6):
            vk.box(f"skirt_seam{s}{k}", (-2.9 + k * 1.15, s * 1.73, 1.02), (0.02, 0.02, 0.4), panel, root, 0.0)

    # ---- hull: steep lower front, long sloped glacis, flat deck, square rear
    vk.hull("lower", [(x, s * 1.1, z) for s in (-1, 1) for x, z in ((-3.45, 0.42), (-3.5, 1.15), (3.15, 0.45), (3.55, 1.0))], olive_dk, root)
    vk.hull("upper", [(x, s * w, z) for s in (-1, 1) for x, w, z in ((-3.5, 1.68, 1.15), (-3.5, 1.68, 1.55), (1.7, 1.68, 1.6), (3.55, 1.6, 1.0), (3.5, 1.6, 1.12))], olive, root, 0.02)
    vk.box("driver_hatch", (2.3, 0.75, 1.42), (0.55, 0.6, 0.06), olive_dk, root)
    for k in range(3):
        vk.box(f"periscope{k}", (2.62, 0.55 + k * 0.2, 1.4), (0.06, 0.14, 0.08), glass, root, 0.0)
    for s in (-1, 1):
        vk.cyl(f"headlight{s}", (3.38, s * 1.25, 1.12), 0.08, 0.1, "X", steel, root, 12)
        vk.box(f"tow{s}", (3.55, s * 0.6, 0.75), (0.16, 0.12, 0.18), steel, root)
    for k in range(5):
        vk.box(f"grille{k}", (-1.9 - k * 0.32, 0, 1.6), (0.24, 2.0, 0.025), panel, root, 0.0)
    vk.box("exhaust", (-3.1, -1.2, 1.52), (0.55, 0.3, 0.12), gun, root)
    vk.box("stowage_l", (-2.6, 1.45, 1.66), (1.2, 0.3, 0.24), olive_dk, root)

    # ---- turret: large welded box with sloped front and cheeks
    tur = vk.node("Turret", (-0.3, 0, 1.6), root)
    vk.hull("turret", [(x, s * w, z) for s in (-1, 1) for x, w, z in ((1.6, 0.9, 0.05), (1.75, 0.8, 0.55), (1.45, 0.8, 1.15), (-1.7, 1.25, 0.05), (-1.7, 1.25, 1.15), (0.9, 1.25, 0.05), (0.9, 1.25, 1.15))], olive, tur, 0.025)
    vk.box("roof_plate", (-0.3, 0, 1.17), (2.2, 2.0, 0.04), olive_dk, tur)
    vk.box("team_band", (-0.4, 0, 0.82), (2.6, 2.53, 0.12), team, tur, 0.0)
    vk.cyl("ring", (0, 0, 0.0), 1.3, 0.12, "Z", olive_dk, tur, 40)
    for s in (-1, 1):
        # armoured gun pod on each side, trunnion at the turret wall, the 35 mm barrel laid up at the sky (shortened like the tank guns so it stays in the cell)
        pod = vk.node(f"pod{s}", (0.55, s * 1.48, 0.62), tur, (0, -GUN_ELEV, 0))
        vk.hull(f"pod_body{s}", [(x, yy, z) for yy in (-0.24, 0.24) for x, z in ((-1.0, -0.28), (-1.0, 0.3), (0.85, -0.2), (0.85, 0.22))], olive, pod, 0.02)
        vk.box(f"pod_lid{s}", (-0.1, 0, 0.31), (1.5, 0.4, 0.04), olive_dk, pod)
        vk.cyl(f"barrel{s}", (1.6, 0, 0.0), 0.05, 1.5, "X", gun, pod, 14)
        vk.cyl(f"recoil{s}", (1.05, 0, 0.0), 0.08, 0.5, "X", gun, pod, 14)
        vk.cyl(f"muzzle{s}", (2.4, 0, 0.0), 0.07, 0.18, "X", gun, pod, 14)
        vk.cyl(f"feed{s}", (-0.6, 0, -0.32), 0.12, 0.35, "X", steel, pod, 12)
        # smoke grenade launchers on the cheeks
        for k in range(3):
            vk.cyl(f"smoke{s}{k}", (1.2 - k * 0.18, s * 1.05, 0.95), 0.05, 0.28, "Y", gun, tur, 10).rotation_euler = (math.radians(70 * s), 0, 0)
    # tracking radar dish and its pedestal on the turret front, electro-optical sight box beside it
    vk.cyl("trk_pedestal", (1.0, -0.35, 1.3), 0.16, 0.25, "Z", olive_dk, tur, 20)
    dish = vk.node("trk_dish", (1.15, -0.35, 1.6), tur, (0, math.radians(-65), 0))
    vk.cyl("dish", (0, 0, 0), 0.42, 0.07, "Z", radar, dish, 32, radius2=0.34)
    vk.cyl("dish_feed", (0, 0, 0.12), 0.04, 0.22, "Z", steel, dish, 10)
    vk.box("eo_box", (1.05, 0.45, 1.38), (0.45, 0.38, 0.38), olive_dk, tur)
    vk.box("eo_glass", (1.29, 0.45, 1.4), (0.02, 0.26, 0.2), glass, tur, 0.0)
    # commander's hatch
    vk.cyl("cmd_hatch", (-0.2, 0.55, 1.22), 0.3, 0.08, "Z", olive_dk, tur, 24)
    # search radar: mast at the turret rear and the flat rectangular antenna, tilted back
    vk.box("mast", (-1.45, 0, 1.55), (0.22, 0.22, 0.8), olive_dk, tur)
    ant = vk.node("search", (-1.45, 0, 2.0), tur, (0, math.radians(-15), 0))
    vk.box("antenna", (0, 0, 0.32), (0.12, 2.1, 0.62), radar, ant, 0.01)
    for k in range(6):
        vk.box(f"antenna_rib{k}", (0.065, -0.9 + k * 0.36, 0.32), (0.02, 0.03, 0.6), panel, ant, 0.0)
    vk.box("antenna_feed", (0.2, 0, 0.32), (0.12, 0.5, 0.12), steel, ant)
    vk.cyl("whip", (-1.65, 0.9, 1.9), 0.012, 1.6, "Z", gun, tur, 6)


if __name__ == "__main__":
    vk.render_sheet("mantis-pgz09", build, LENGTH, centre_x=0.0, samples=int(os.environ.get("PGZ_SAMPLES", "32")),
                    preview=os.environ.get("PGZ_PREVIEW"), preview_dir=int(os.environ.get("PGZ_DIR", "4")))

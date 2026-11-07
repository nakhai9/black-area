"""
India's contested capital: Rashtrapati Bhavan (New Delhi, Edwin Lutyens, 1929).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/india_capital_render.py

Writes ui/public/sprites/building-nation-india.png (then run tools/to_webp.py).

Real building: about 190 m x 160 m, two storeys over a raised plinth; red Dholpur sandstone for the base and the lower
storey, cream sandstone above; a deep chhajja (stone sunshade cornice) all round; a 12-column portico at the top of a
wide flight of steps in the middle of the east front; the copper Durbar Hall dome (shaped after the Sanchi stupa) on a
drum ringed by columns; domed chhatris (open pavilions) on the corner wings.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The long
east front faces +v (lower left on screen), the side faces +u. Picture height 76 art px (NationCapital.ts HEIGHTS).
The two flag poles at (0.15, 2.25) and (3.85, 2.25), 37 art px tall, carry the game's animated flags.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
from kit import box, cylinder, dome, mat, render, rod, zp  # noqa: E402  (infrastructure only)

D = 2.4
HEIGHT = 76

RED = "#a9563f"      # Dholpur red sandstone
RED_DARK = "#8e4634"
CREAM = "#dccbaa"    # cream sandstone
CREAM_LIGHT = "#e9dcc1"
COPPER = "#6f5a4a"   # weathered copper dome
GLASS = "#2c2a28"


def red(s=24):
    return mat(RED, 0.85, grain=0.12, scale=s)


def cream(s=24):
    return mat(CREAM, 0.8, grain=0.1, scale=s)


def opening(face, a0, a1, plane, z, h, glass, frame, sill=None):
    """One window on a visible face: dark glass at the wall plane, a frame standing proud round it (so the glass
    reads as set back), and a stone sill under it. face "left" = the +v face (a runs along u), "right" = +u face."""
    t, f = 0.014, 0.7  # frame depth (tiles) and frame bar height (art px)
    bar = 0.012       # frame bar width (tiles)

    def put(b0, b1, zz, hh, depth, material, out=0.0):
        if face == "left":
            box(b0, plane + out, b1 - b0, depth, zz, hh, material)
        else:
            box(plane + out, b0, depth, b1 - b0, zz, hh, material)

    put(a0, a1, z, h, 0.004, glass)
    put(a0 - bar, a0, z, h, t, frame)
    put(a1, a1 + bar, z, h, t, frame)
    put(a0 - bar, a1 + bar, z + h, f, t, frame)
    put(a0 - bar, a1 + bar, z - f, f, t, frame)
    put((a0 + a1) / 2 - bar / 3, (a0 + a1) / 2 + bar / 3, z, h, t * 0.7, frame)  # mullion
    if sill is not None:
        put(a0 - bar * 2, a1 + bar * 2, z - f - 0.8, 0.8, t * 2.2, sill)


def row(face, lo, hi, plane, z, h, n, glass, frame, sill, fill=0.5):
    step = (hi - lo) / n
    for i in range(n):
        c = lo + (i + 0.5) * step
        opening(face, c - step * fill / 2, c + step * fill / 2, plane, z, h, glass, frame, sill)


def pilasters(face, lo, hi, plane, z, h, n, material, w=0.035):
    step = (hi - lo) / n
    for i in range(n + 1):
        c = lo + i * step
        if face == "left":
            box(c - w / 2, plane, w, 0.025, z, h, material)
        else:
            box(plane, c - w / 2, 0.025, w, z, h, material)


def column(u, v, z, h, r, shaft, cap):
    cylinder(u, v, r * 1.35, z, 0.8, cap, 16)
    cylinder(u, v, r, z + 0.8, h - 1.8, shaft, 20)
    cylinder(u, v, r * 1.3, z + h - 1.0, 1.0, cap, 16)


def chhatri(u, v, z, r):
    """Open domed pavilion: square base, four slim columns, a broad eave, a small cream dome with a finial."""
    box(u - r, v - r, 2 * r, 2 * r, z, 1.2, red())
    for du, dv in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        column(u + du * r * 0.72, v + dv * r * 0.72, z + 1.2, 5.5, 0.016, mat(CREAM_LIGHT, 0.7, grain=0.05), cream())
    box(u - r * 1.25, v - r * 1.25, 2.5 * r, 2.5 * r, z + 6.7, 0.7, red())
    dome(u, v, r * 0.85, z + 7.4, 5.5, mat(CREAM_LIGHT, 0.7, grain=0.06), 32, 10)
    rod((u, v, zp(z + 12.9)), (u, v, zp(z + 15)), 0.006, mat("#c9a94e", 0.3, metal=0.9, grain=0), 6)


def plaza():
    box(0, 0, 4, D, 0, 3, mat("#b3aa98", 0.95, grain=0.14, scale=10))
    j = mat("#9c9483", 0.95, grain=0.05)
    for i in range(1, 16):
        box(i * 0.25, 0, 0.008, D, 3, 0.05, j)
    for i in range(1, 10):
        box(0, i * 0.24, 4, 0.008, 3, 0.05, j)


def poles():
    p = mat("#d8d8d8", 0.3, metal=0.9, grain=0)
    for u, v in ((0.15, 2.25), (3.85, 2.25)):
        rod((u, v, zp(3)), (u, v, zp(37)), 0.012, p, 8)
        cylinder(u, v, 0.04, 3, 0.8, mat("#55595e", 0.5, metal=0.6, grain=0), 12)
        cylinder(u, v, 0.02, 37, 0.8, mat("#d4b24a", 0.3, metal=0.9, grain=0), 12)


def build():
    glass = mat(GLASS, 0.1, metal=0.1, grain=0, glass=True)
    frame_r = mat("#c06e55", 0.7, grain=0.05)
    frame_c = mat("#f0e6cf", 0.7, grain=0.04)
    sill_r = mat(RED_DARK, 0.85, grain=0.08)
    sill_c = mat("#cdbb98", 0.8, grain=0.06)

    plaza()
    # Raised plinth with a moulded top course.
    box(0.15, 0.12, 3.7, 2.0, 3, 5, mat(RED_DARK, 0.9, grain=0.14, scale=20))
    box(0.13, 0.1, 3.74, 2.04, 8, 0.8, red())

    # Main block: red lower storey, cream upper storey.
    U0, U1, V0, V1 = 0.3, 3.7, 0.3, 1.72
    box(U0, V0, U1 - U0, V1 - V0, 8.8, 9, red())
    box(U0, V0, U1 - U0, V1 - V0, 17.8, 9.6, cream())
    box(U0 - 0.01, V0 - 0.01, U1 - U0 + 0.02, V1 - V0 + 0.02, 17.4, 0.6, mat(RED_DARK, 0.85))  # string course
    for face, lo, hi, plane, n in (("left", U0, U1, V1, 22), ("right", V0, V1, U1, 9)):
        row(face, lo + 0.05, hi - 0.05, plane, 11.0, 4.6, n, glass, frame_r, sill_r)
        row(face, lo + 0.05, hi - 0.05, plane, 20.4, 5.0, n, glass, frame_c, sill_c)
        pilasters(face, lo, hi, plane, 17.8, 9.6, n, mat(CREAM_LIGHT, 0.75, grain=0.06))

    # End wings, stepped forward on the front, one storey of cream above red, like the real corner pavilions.
    for u0 in (U0 - 0.05, U1 - 0.55):
        box(u0, V0, 0.6, V1 - V0 + 0.14, 8.8, 9, red())
        box(u0, V0, 0.6, V1 - V0 + 0.14, 17.8, 9.6, cream())
        row("left", u0 + 0.06, u0 + 0.54, V1 + 0.14, 11.0, 4.6, 3, glass, frame_r, sill_r)
        row("left", u0 + 0.06, u0 + 0.54, V1 + 0.14, 20.4, 5.0, 3, glass, frame_c, sill_c)
    row("right", V0 + 0.05, V1 + 0.1, U1 + 0.05, 11.0, 4.6, 9, glass, frame_r, sill_r)

    # Chhajja: the deep red sunshade cornice round the whole roof line, on a thin bracket course.
    box(U0 - 0.06, V0 - 0.04, U1 - U0 + 0.12, V1 - V0 + 0.22, 27.4, 0.6, mat(CREAM_LIGHT, 0.8))
    box(U0 - 0.12, V0 - 0.08, U1 - U0 + 0.24, V1 - V0 + 0.32, 28.0, 0.9, mat(RED, 0.8, grain=0.08))
    # Roof terrace with a low pierced (jali) parapet: posts and a coping.
    box(U0, V0, U1 - U0, V1 - V0 + 0.14, 28.0, 0.5, mat("#b9a98a", 0.9, grain=0.08))
    coping = mat(CREAM, 0.8, grain=0.06)
    for i in range(48):
        box(U0 + 0.02 + i * (U1 - U0 - 0.04) / 47, V1 + 0.12, 0.018, 0.02, 28.9, 1.6, coping)
    for i in range(20):
        box(U1 - 0.02, V0 + 0.02 + i * (V1 - V0 + 0.08) / 19, 0.02, 0.018, 28.9, 1.6, coping)
    box(U0, V1 + 0.11, U1 - U0, 0.04, 30.5, 0.5, coping)
    box(U1 - 0.04, V0, 0.04, V1 - V0 + 0.15, 30.5, 0.5, coping)

    # Central portico: 12 columns on a raised floor, entablature and cornice, under the dome.
    P0, P1, PV = 1.2, 2.8, 1.98
    box(P0 - 0.05, V1, P1 - P0 + 0.1, PV - V1 + 0.06, 8.8, 0.8, red())
    for i in range(12):
        column(P0 + (i + 0.5) * (P1 - P0) / 12, PV, 9.6, 17.6, 0.022, mat(CREAM_LIGHT, 0.7, grain=0.05), cream())
    box(P0 - 0.05, V1, P1 - P0 + 0.1, PV - V1 + 0.06, 27.2, 1.4, cream())
    box(P0 - 0.09, V1, P1 - P0 + 0.18, PV - V1 + 0.1, 28.6, 0.8, mat(RED, 0.8, grain=0.08))
    box(P0, V1 + 0.01, P1 - P0, 0.004, 10.0, 16.5, mat("#3b2d26", 0.9, grain=0.02))  # shaded wall behind the columns
    # Grand flight of steps down to the forecourt.
    for k in range(6):
        box(P0 + 0.05, PV + 0.04 + k * 0.035, P1 - P0 - 0.1, 0.04, 3, 5.8 - k * 0.95, mat(RED_DARK, 0.85, grain=0.1))

    # Durbar Hall: drum ringed by columns, red band, the copper stupa dome, a slim finial.
    CU, CV = 2.0, 1.05
    cylinder(CU, CV, 0.5, 28.5, 9, cream(), 64)
    for i in range(24):
        a = i / 24 * 2 * math.pi
        column(CU + math.cos(a) * 0.55, CV + math.sin(a) * 0.55, 28.5, 8.5, 0.014, mat(CREAM_LIGHT, 0.7, grain=0.05), cream())
    cylinder(CU, CV, 0.6, 37.0, 1.0, mat(CREAM_LIGHT, 0.8), 64)
    cylinder(CU, CV, 0.56, 38.0, 1.6, mat(RED, 0.8, grain=0.08), 64)
    dome(CU, CV, 0.52, 39.6, 24, mat(COPPER, 0.5, metal=0.35, grain=0.08, scale=30), 64, 16)
    cylinder(CU, CV, 0.06, 63.4, 2.2, mat(CREAM_LIGHT, 0.7), 16)
    rod((CU, CV, zp(65.6)), (CU, CV, zp(71.5)), 0.009, mat("#c9a94e", 0.3, metal=0.9, grain=0), 8)

    # Corner chhatris on the wings.
    for u, v in ((0.55, 0.55), (3.45, 0.55), (0.55, 1.62), (3.45, 1.62)):
        chhatri(u, v, 28.9, 0.13)

    poles()


def smooth_round_parts():
    """Hard where hard, round where round (ART_GUIDE 1): box corners (90 deg) stay sharp, domes and columns smooth."""
    import bpy

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))


kit.reset()
build()
smooth_round_parts()
render("nation-india", (4, D), HEIGHT)

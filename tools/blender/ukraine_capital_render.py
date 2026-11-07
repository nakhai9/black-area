"""
Ukraine's contested capital: the Verkhovna Rada building (Kyiv, Volodymyr Zabolotny, 1939).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/ukraine_capital_render.py

Writes ui/public/sprites/building-nation-ukraine.png (then run tools/to_webp.py).

Real building: a pale grey neoclassical block of two tall storeys over a rusticated granite base; tall windows in
framed bays between flat pilasters; a heavy cornice and attic; a six-column Corinthian portico with a sculpted
pediment over a broad flight of steps on the main front; in the middle of the roof a drum lit by windows between
paired pilasters, carrying a ribbed glass dome and a small lantern with a flag mast.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 76 art px (NationCapital.ts HEIGHTS).
The two flag poles at (0.15, 2.25) and (3.85, 2.25), 37 art px tall, carry the game's animated flags.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
from kit import box, cylinder, dome, mat, render, rod, roof, zp  # noqa: E402  (infrastructure only)

D = 2.4
HEIGHT = 76

WALL = "#cfccc3"      # pale grey render
WALL_LIGHT = "#e3e0d8"
GRANITE = "#7f7b74"   # rusticated base
GLASS = "#2b343c"


def wall(s=24):
    return mat(WALL, 0.8, grain=0.1, scale=s)


def light(s=24):
    return mat(WALL_LIGHT, 0.75, grain=0.06, scale=s)


def opening(face, a0, a1, plane, z, h, glass, frame, sill=None):
    """One window on a visible face: dark glass at the wall plane, a frame standing proud round it (so the glass
    reads as set back), a transom bar and a stone sill. face "left" = the +v face (a runs along u), "right" = +u."""
    t, f, bar = 0.014, 0.7, 0.012

    def put(b0, b1, zz, hh, depth, material):
        if face == "left":
            box(b0, plane, b1 - b0, depth, zz, hh, material)
        else:
            box(plane, b0, depth, b1 - b0, zz, hh, material)

    put(a0, a1, z, h, 0.004, glass)
    put(a0 - bar, a0, z, h, t, frame)
    put(a1, a1 + bar, z, h, t, frame)
    put(a0 - bar, a1 + bar, z + h, f, t, frame)
    put(a0 - bar, a1 + bar, z - f, f, t, frame)
    put(a0, a1, z + h * 0.7, 0.4, t * 0.7, frame)  # transom
    put((a0 + a1) / 2 - bar / 3, (a0 + a1) / 2 + bar / 3, z, h, t * 0.7, frame)
    if sill is not None:
        put(a0 - bar * 2, a1 + bar * 2, z - f - 0.8, 0.8, t * 2.2, sill)


def bays(face, lo, hi, plane, z0, z1, n, glass, frame, sill, pil):
    """n window bays between flat pilasters, two storeys of windows each."""
    step = (hi - lo) / n
    for i in range(n + 1):
        c = lo + i * step
        if face == "left":
            box(c - 0.02, plane, 0.04, 0.03, z0, z1 - z0, pil)
        else:
            box(plane, c - 0.02, 0.03, 0.04, z0, z1 - z0, pil)
    for i in range(n):
        c = lo + (i + 0.5) * step
        w = step * 0.42
        opening(face, c - w / 2, c + w / 2, plane, z0 + 1.6, 5.2, glass, frame, sill)
        opening(face, c - w / 2, c + w / 2, plane, z0 + 9.6, 5.6, glass, frame, sill)


def column(u, v, z, h, r, shaft, cap):
    """Corinthian column: square plinth, round base, shaft, flared capital, abacus."""
    box(u - r * 1.5, v - r * 1.5, r * 3, r * 3, z, 0.6, cap)
    cylinder(u, v, r * 1.3, z + 0.6, 0.6, cap, 16)
    cylinder(u, v, r, z + 1.2, h - 3.2, shaft, 24)
    cylinder(u, v, r * 1.35, z + h - 2.0, 1.4, cap, 16)
    box(u - r * 1.6, v - r * 1.6, r * 3.2, r * 3.2, z + h - 0.6, 0.6, cap)


def plaza():
    box(0, 0, 4, D, 0, 3, mat("#a9a59b", 0.95, grain=0.14, scale=10))
    j = mat("#96928a", 0.95, grain=0.05)
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
    glass = mat(GLASS, 0.08, metal=0.15, grain=0, glass=True)
    frame = mat("#f1efe9", 0.6, grain=0.03)
    sill = mat("#b7b3aa", 0.8, grain=0.06)
    pil = light()

    plaza()
    # Rusticated granite base: courses of stone with dark joints.
    U0, U1, V0, V1 = 0.3, 3.7, 0.32, 1.72
    box(U0 - 0.05, V0 - 0.05, U1 - U0 + 0.1, V1 - V0 + 0.1, 3, 7, mat(GRANITE, 0.9, grain=0.16, scale=20))
    joint = mat("#5a5751", 0.95, grain=0.02)
    for k in range(1, 4):
        box(U0 - 0.055, V1 + 0.05, U1 - U0 + 0.11, 0.004, 3 + k * 1.75, 0.25, joint)
        box(U1 + 0.05, V0 - 0.055, 0.004, V1 - V0 + 0.11, 3 + k * 1.75, 0.25, joint)
    box(U0 - 0.07, V0 - 0.07, U1 - U0 + 0.14, V1 - V0 + 0.14, 10, 0.8, light())

    # Main block, two storeys of framed windows between pilasters.
    box(U0, V0, U1 - U0, V1 - V0, 10.8, 17, wall())
    bays("left", U0, 1.3, V1, 10.8, 27.8, 4, glass, frame, sill, pil)
    bays("left", 2.7, U1, V1, 10.8, 27.8, 4, glass, frame, sill, pil)
    bays("right", V0, V1, U1, 10.8, 27.8, 6, glass, frame, sill, pil)
    box(U0 - 0.01, V0 - 0.01, U1 - U0 + 0.02, V1 - V0 + 0.02, 19.2, 0.6, light())  # string course

    # Entablature, heavy cornice and a plain attic with its coping.
    box(U0 - 0.02, V0 - 0.02, U1 - U0 + 0.04, V1 - V0 + 0.04, 27.8, 1.4, light())
    box(U0 - 0.07, V0 - 0.07, U1 - U0 + 0.14, V1 - V0 + 0.14, 29.2, 0.9, mat("#bdb9b0", 0.8, grain=0.06))
    box(U0 + 0.02, V0 + 0.02, U1 - U0 - 0.04, V1 - V0 - 0.04, 30.1, 2.2, wall())
    box(U0, V0, U1 - U0, V1 - V0, 32.3, 0.5, light())
    box(U0 + 0.1, V0 + 0.1, U1 - U0 - 0.2, V1 - V0 - 0.2, 32.8, 0.2, mat("#8d8e8c", 0.6, metal=0.3, grain=0.02))

    # Portico: six Corinthian columns, deep entablature, sculpted pediment, the doors behind.
    P0, P1, PV = 1.36, 2.64, 2.06
    box(P0 - 0.06, V1, P1 - P0 + 0.12, PV - V1 + 0.08, 10, 0.8, light())
    box(P0, V1 + 0.002, P1 - P0, 0.004, 10.8, 17, mat("#5d5a54", 0.9, grain=0.03))  # shaded wall behind
    for i in range(3):
        c = P0 + (i + 0.5) * (P1 - P0) / 3
        opening("left", c - 0.08, c + 0.08, V1 + 0.006, 11.4, 9.0, mat("#3a2e26", 0.6, grain=0.04), frame)
    for i in range(6):
        column(P0 + (i + 0.5) * (P1 - P0) / 6, PV, 10.8, 17, 0.032, light(), mat(WALL_LIGHT, 0.7, grain=0.04))
    box(P0 - 0.06, V1, P1 - P0 + 0.12, PV - V1 + 0.08, 27.8, 1.4, light())
    box(P0 - 0.09, V1, P1 - P0 + 0.18, PV - V1 + 0.11, 29.2, 0.9, mat("#bdb9b0", 0.8, grain=0.06))
    roof(P0 - 0.09, V1, P1 - P0 + 0.18, PV - V1 + 0.11, 30.1, 6, mat("#c9c6be", 0.8, grain=0.05), kind="gable", ridge="v", overhang=0.0)
    # Tympanum relief: a darker sculpted group inside the pediment.
    box(P0 + 0.25, PV + 0.1, P1 - P0 - 0.5, 0.006, 30.3, 2.4, mat("#a6a29a", 0.85, grain=0.08))
    # Broad flight of granite steps.
    for k in range(7):
        box(P0 - 0.02, PV + 0.07 + k * 0.03, P1 - P0 + 0.04, 0.034, 3, 7.8 - k * 1.1, mat(GRANITE, 0.9, grain=0.12))

    # Drum: windows between paired pilasters, cornice.
    CU, CV = 2.0, 1.02
    cylinder(CU, CV, 0.46, 32.8, 10, wall(), 64)
    for i in range(12):
        a = (i + 0.5) / 12 * 2 * math.pi
        for da in (-0.07, 0.07):
            cylinder(CU + math.cos(a + da) * 0.465, CV + math.sin(a + da) * 0.465, 0.014, 32.8, 10, light(), 8)
        b = i / 12 * 2 * math.pi
        box(CU + math.cos(b) * 0.455 - 0.04, CV + math.sin(b) * 0.455 - 0.04, 0.08, 0.08, 35.0, 5.6, glass)
    cylinder(CU, CV, 0.5, 42.8, 1.0, light(), 64)
    # Ribbed glass dome and its lantern.
    dome(CU, CV, 0.44, 43.8, 20, mat("#6f8a99", 0.08, metal=0.35, grain=0, glass=True), 64, 16)
    rib = mat("#a8adb0", 0.35, metal=0.8, grain=0)
    r0, h0, z0 = 0.445, 20.0, 43.8
    for i in range(16):
        a = i / 16 * 2 * math.pi
        prev = None
        for k in range(9):
            t = k / 8 * (math.pi / 2) * 0.92
            p = (CU + math.cos(a) * r0 * math.cos(t), CV + math.sin(a) * r0 * math.cos(t), zp(z0 + h0 * math.sin(t)))
            if prev:
                rod(prev, p, 0.006, rib, 6)
            prev = p
    cylinder(CU, CV, 0.08, 63.2, 3.2, light(), 16)
    dome(CU, CV, 0.09, 66.4, 2.4, mat("#8d8e8c", 0.5, metal=0.5, grain=0), 16, 6)
    rod((CU, CV, zp(68.8)), (CU, CV, zp(73)), 0.007, mat("#d8d8d8", 0.3, metal=0.9, grain=0), 6)

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
render("nation-ukraine", (4, D), HEIGHT)

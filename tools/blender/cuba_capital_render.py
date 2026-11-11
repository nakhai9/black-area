"""
Cuba's contested capital: El Capitolio (Havana, 1929).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/cuba_capital_render.py

Writes ui/public/sprites/building-nation-cuba.png (then run tools/to_webp.py).

Real building: a long neoclassical palace of pale Capellanía limestone on a rusticated base; two long wings, each
fronted by a deep loggia of Ionic columns between end pavilions; in the middle a portico of twelve Ionic columns in
two rows under a plain pediment, at the top of a monumental flight of steps (55 steps) between the two great bronze
statues' pedestals; behind it the dome, raised high on a two-stage drum: a ring of columns, then an attic lit by
windows, and the ribbed stone dome with a lantern of columns and a small cupola.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 96 art px (NationCapital.ts HEIGHTS).
The two flag poles at (0.15, 2.25) and (3.85, 2.25), 37 art px tall, carry the game's animated flags.
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
from kit import _obj, box, cylinder, dome, lathe, mat, prism, render, rod, roof, zp  # noqa: E402,F401  (infrastructure only)

D = 2.4


def put(face, a0, a1, plane, z, h, depth, material, out=0.0):
    """Slab on a visible face: "left" = the +v face (a runs along u), "right" = the +u face (a runs along v)."""
    if face == "left":
        box(a0, plane + out, a1 - a0, depth, z, h, material)
    else:
        box(plane + out, a0, depth, a1 - a0, z, h, material)


def opening(face, a0, a1, plane, z, h, glass, frame, sill=None, mullion=True, transom=False):
    """One window: dark glass at the wall plane, a frame standing proud round it (the glass reads as set back),
    a mullion (and transom), and a stone sill under it."""
    t, f, bar = 0.014, 0.7, 0.012
    put(face, a0, a1, plane, z, h, 0.004, glass)
    put(face, a0 - bar, a0, plane, z, h, t, frame)
    put(face, a1, a1 + bar, plane, z, h, t, frame)
    put(face, a0 - bar, a1 + bar, plane, z + h, f, t, frame)
    put(face, a0 - bar, a1 + bar, plane, z - f, f, t, frame)
    if mullion:
        put(face, (a0 + a1) / 2 - bar / 3, (a0 + a1) / 2 + bar / 3, plane, z, h, t * 0.7, frame)
    if transom:
        put(face, a0, a1, plane, z + h * 0.68, 0.45, t * 0.7, frame)
    if sill is not None:
        put(face, a0 - bar * 2, a1 + bar * 2, plane, z - f - 0.8, 0.8, t * 2.2, sill)


def row(face, lo, hi, plane, z, h, n, glass, frame, sill=None, fill=0.5, **kw):
    step = (hi - lo) / n
    for i in range(n):
        c = lo + (i + 0.5) * step
        opening(face, c - step * fill / 2, c + step * fill / 2, plane, z, h, glass, frame, sill, **kw)


def pilasters(face, lo, hi, plane, z, h, n, material, w=0.035, depth=0.025):
    step = (hi - lo) / n
    for i in range(n + 1):
        put(face, lo + i * step - w / 2, lo + i * step + w / 2, plane, z, h, depth, material)


def column(u, v, z, h, r, shaft, cap, segs=20):
    """Round column: square plinth, shaft, capital and abacus."""
    box(u - r * 1.4, v - r * 1.4, r * 2.8, r * 2.8, z, 0.7, cap)
    cylinder(u, v, r * 1.2, z + 0.7, 0.5, cap, 16)
    cylinder(u, v, r, z + 1.2, h - 2.4, shaft, segs)
    cylinder(u, v, r * 1.3, z + h - 1.2, 0.6, cap, 16)
    box(u - r * 1.45, v - r * 1.45, r * 2.9, r * 2.9, z + h - 0.6, 0.6, cap)


def balustrade(face, lo, hi, plane, z, material, h=2.2, n=None):
    """Balusters with a plinth and a coping rail along a visible face."""
    n = n or max(4, int((hi - lo) / 0.035))
    put(face, lo, hi, plane - 0.03, z, 0.4, 0.03, material)
    for i in range(n):
        c = lo + (i + 0.5) * (hi - lo) / n
        put(face, c - 0.006, c + 0.006, plane - 0.022, z + 0.4, h - 0.8, 0.014, material)
    put(face, lo, hi, plane - 0.034, z + h - 0.4, 0.4, 0.038, material)


def steps(u0, u1, v_front, z_top, n, depth, material, ground=3):
    """Flight of steps on the +v front, rising from the plaza to z_top."""
    rise = (z_top - ground) / n
    for k in range(n):
        box(u0, v_front - (n - k) * depth, u1 - u0, depth, ground, rise * (k + 1) - 0.02, material)
    box(u0, v_front - n * depth - 0.002, u1 - u0, 0.002, ground, z_top - ground, material)


def plaza(c="#aea796", j="#99927f"):
    box(0, 0, 4, D, 0, 3, mat(c, 0.95, grain=0.14, scale=10))
    jm = mat(j, 0.95, grain=0.05)
    for i in range(1, 16):
        box(i * 0.25, 0, 0.008, D, 3, 0.05, jm)
    for i in range(1, 10):
        box(0, i * 0.24, 4, 0.008, 3, 0.05, jm)


def poles():
    p = mat("#d8d8d8", 0.3, metal=0.9, grain=0)
    for u, v in ((0.15, 2.25), (3.85, 2.25)):
        rod((u, v, zp(3)), (u, v, zp(37)), 0.012, p, 8)
        cylinder(u, v, 0.04, 3, 0.8, mat("#55595e", 0.5, metal=0.6, grain=0), 12)
        cylinder(u, v, 0.02, 37, 0.8, mat("#d4b24a", 0.3, metal=0.9, grain=0), 12)


def smooth_round_parts():
    """Hard where hard, round where round (ART_GUIDE 1): box corners stay sharp, columns and domes smooth."""
    import bpy

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))

HEIGHT = 96


def build():
    stone = mat("#e6dec9", 0.8, grain=0.1, scale=26)       # Capellanía limestone
    light = mat("#f1ebdb", 0.7, grain=0.05)
    base = mat("#cbc2ad", 0.85, grain=0.14, scale=24)
    shade = mat("#5d564b", 0.9, grain=0.03)
    glass = mat("#3c464f", 0.1, metal=0.15, grain=0, glass=True)
    frame = mat("#f6f1e4", 0.65, grain=0.03)
    dome_m = mat("#d8d0bb", 0.65, metal=0.05, grain=0.1, scale=30)
    bronze = mat("#5b4a33", 0.45, metal=0.7, grain=0.05)

    plaza("#b9b19f", "#a39b8a")
    U0, U1, V0, V1 = 0.2, 3.8, 0.35, 1.6
    # Rusticated base storey with its windows, a moulded top course.
    box(U0, V0, U1 - U0, V1 - V0, 3, 8, base)
    for zz in (4.6, 6.6):
        box(U0 - 0.005, V0 - 0.005, U1 - U0 + 0.01, V1 - V0 + 0.01, zz, 0.25, mat("#b3aa95", 0.9, grain=0.05))
    for face, lo, hi, plane, n in (("left", U0, U1, V1, 28), ("right", V0, V1, U1, 10)):
        row(face, lo + 0.04, hi - 0.04, plane, 4.0, 2.8, n, glass, frame, None, fill=0.4, mullion=False)
    box(U0 - 0.02, V0 - 0.02, U1 - U0 + 0.04, V1 - V0 + 0.04, 11, 0.8, light)
    # Main storey: wings with deep Ionic loggias between end pavilions.
    box(U0, V0, U1 - U0, V1 - V0 - 0.18, 11.8, 15, stone)
    for w0, w1 in ((U0 + 0.4, 1.45), (2.55, U1 - 0.4)):
        box(w0, V1 - 0.18, w1 - w0, 0.004, 11.8, 15, shade)
        row("left", w0, w1, V1 - 0.176, 13.0, 7.5, 10, glass, frame, None, fill=0.35, transom=True)
        for i in range(11):
            c = w0 + i * (w1 - w0) / 10
            from_v = V1 - 0.03
            box(c - 0.03, from_v - 0.03, 0.06, 0.06, 11.8, 0.6, light)
            cylinder(c, from_v, 0.022, 12.4, 13.6, light, 16)
            box(c - 0.032, from_v - 0.032, 0.064, 0.064, 26.0, 0.8, light)
        box(w0, V1 - 0.18, w1 - w0, 0.18, 26.8, 1.6, stone)
    for p0 in (U0, 1.45, 2.55, U1 - 0.4):
        pw = 0.4 if p0 in (U0, U1 - 0.4) else 0.0
        if pw:
            box(p0, V0, pw, V1 - V0 + 0.02, 11.8, 16.6, stone)
            for k in (0.08, 0.32):
                put("left", p0 + k - 0.02, p0 + k + 0.02, V1 + 0.02, 11.8, 16.6, 0.02, light)
            opening("left", p0 + 0.14, p0 + 0.26, V1 + 0.02, 14.0, 9.0, glass, frame, light, transom=True)
            put("left", p0 + 0.12, p0 + 0.28, V1 + 0.02, 24.6, 0.9, 0.03, light)
    row("right", V0 + 0.05, V1 - 0.03, U1, 13.5, 9.0, 6, glass, frame, light, fill=0.4, transom=True)
    pilasters("right", V0, V1 + 0.02, U1, 11.8, 16.6, 6, light, w=0.04)
    # Entablature, cornice and balustraded roof line.
    box(U0 - 0.02, V0 - 0.02, U1 - U0 + 0.04, V1 - V0 + 0.06, 28.4, 1.4, light)
    box(U0 - 0.05, V0 - 0.05, U1 - U0 + 0.1, V1 - V0 + 0.1, 29.8, 0.8, light)
    box(U0 + 0.02, V0 + 0.02, U1 - U0 - 0.04, V1 - V0 - 0.02, 30.6, 0.05, mat("#a49f94", 0.9, grain=0.1, scale=40))
    balustrade("left", U0, U1, V1 + 0.04, 30.6, stone, h=2.4)
    balustrade("right", V0, V1 + 0.04, U1 + 0.04, 30.6, stone, h=2.4)

    # Central portico: twelve Ionic columns in two rows of six, entablature, pediment, deep shade behind.
    P0, P1, PV = 1.5, 2.5, 2.0
    box(P0 - 0.06, V0 + 0.3, P1 - P0 + 0.12, V1 - V0 - 0.3, 11.8, 19.6, stone)
    box(P0 - 0.06, V1 - 0.01, P1 - P0 + 0.12, PV - V1 + 0.06, 3, 8.8, base)
    box(P0, V1 - 0.005, P1 - P0, 0.004, 11.8, 16, shade)
    for i in range(3):
        c = P0 + (i + 1) * (P1 - P0) / 4
        put("left", c - 0.06, c + 0.06, V1 - 0.004, 11.8, 8, 0.006, bronze)  # the bronze doors
    for vv in (PV - 0.2, PV - 0.03):
        for i in range(6):
            column(P0 + 0.06 + i * (P1 - P0 - 0.12) / 5, vv, 11.8, 17.4, 0.035, light, stone, 24)
    box(P0 - 0.06, V1 - 0.01, P1 - P0 + 0.12, PV - V1 + 0.06, 29.2, 2.0, light)
    box(P0 - 0.09, V1 - 0.01, P1 - P0 + 0.18, PV - V1 + 0.09, 31.2, 0.8, light)
    roof(P0 - 0.06, V1 - 0.01, P1 - P0 + 0.12, PV - V1 + 0.06, 32.0, 7, stone, kind="gable", ridge="v", overhang=0.02)
    # The monumental flight of steps between the two statue pedestals.
    steps(P0 + 0.05, P1 - 0.05, 2.38, 11.8, 14, 0.026, mat("#d9d1bd", 0.75, grain=0.1, scale=30))
    for u in (P0 - 0.07, P1 + 0.01):
        box(u, 2.12, 0.06, 0.18, 3, 9, light)
        box(u + 0.005, 2.17, 0.05, 0.08, 12, 5, bronze)

    # Dome: square podium over the roof, ring of columns round the drum, windowed attic, ribbed dome, lantern.
    CU, CV = 2.0, 0.95
    box(CU - 0.62, CV - 0.62, 1.24, 1.24, 30.6, 6, stone)
    box(CU - 0.65, CV - 0.65, 1.3, 1.3, 36.6, 0.8, light)
    cylinder(CU, CV, 0.5, 37.4, 16, stone, 64)
    for i in range(24):
        a = i / 24 * 2 * math.pi
        column(CU + math.cos(a) * 0.56, CV + math.sin(a) * 0.56, 37.4, 15, 0.018, light, stone, 12)
        b = (i + 0.5) / 24 * 2 * math.pi
        if math.cos(b) + math.sin(b) > -0.3:
            u, v = CU + math.cos(b) * 0.5, CV + math.sin(b) * 0.5
            box(u - 0.018, v - 0.018, 0.036, 0.036, 41, 8, glass)
    cylinder(CU, CV, 0.6, 52.4, 1.4, light, 64)
    cylinder(CU, CV, 0.47, 53.8, 6, stone, 64)
    for i in range(16):
        b = (i + 0.5) / 16 * 2 * math.pi
        if math.cos(b) + math.sin(b) > -0.3:
            box(CU + math.cos(b) * 0.47 - 0.02, CV + math.sin(b) * 0.47 - 0.02, 0.04, 0.04, 55.0, 3.4, glass)
    cylinder(CU, CV, 0.5, 59.8, 0.8, light, 64)
    dome(CU, CV, 0.46, 60.6, 21, dome_m, 64, 16)
    rib = mat("#e9e2cf", 0.6, grain=0.04)
    for i in range(16):
        a = i / 16 * 2 * math.pi
        prev = None
        for k in range(9):
            t = k / 8 * 0.92
            r = 0.465 * math.cos(t * math.pi / 2)
            pt = (CU + math.cos(a) * r, CV + math.sin(a) * r, zp(60.6 + 21 * math.sin(t * math.pi / 2)))
            if prev:
                rod(prev, pt, 0.009, rib, 6)
            prev = pt
    # Lantern: ring of small columns, cornice, small cupola, finial.
    cylinder(CU, CV, 0.1, 80.5, 1.0, light, 24)
    cylinder(CU, CV, 0.07, 81.5, 6, shade, 16)
    for i in range(8):
        a = i / 8 * 2 * math.pi
        cylinder(CU + math.cos(a) * 0.09, CV + math.sin(a) * 0.09, 0.011, 81.5, 6, light, 8)
    cylinder(CU, CV, 0.11, 87.5, 0.8, light, 24)
    dome(CU, CV, 0.09, 88.3, 3.4, dome_m, 24, 6)
    rod((CU, CV, zp(91.5)), (CU, CV, zp(94.5)), 0.008, mat("#c9b46a", 0.3, metal=0.9, grain=0))

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-cuba", (4, D), HEIGHT)

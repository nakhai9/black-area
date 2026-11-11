"""
Belarus's contested capital: the Palace of Independence (Minsk, 2013).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/belarus_capital_render.py

Writes ui/public/sprites/building-nation-belarus.png (then run tools/to_webp.py).

Real building: a long, symmetrical post-Soviet neoclassical palace clad in pale sand-coloured limestone over a dark
grey granite base; a giant order of square pilasters running the full height of the fronts with tall windows between
them; a heavy cornice and a plain attic; in the middle of the main front a tall portico of eight giant round columns
over a broad granite stair, carrying an entablature with the state emblem; a raised central block behind it with a
band of clerestory windows; flat roofs behind parapets.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 60 art px (NationCapital.ts HEIGHTS).
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

HEIGHT = 60

SAND = "#ddd2bb"
SAND_LIGHT = "#ebe3d1"
GRANITE = "#6c6a66"


def build():
    stone = mat(SAND, 0.82, grain=0.1, scale=24)
    light = mat(SAND_LIGHT, 0.75, grain=0.06)
    gran = mat(GRANITE, 0.6, grain=0.12, scale=30)
    glass = mat("#2d3742", 0.1, metal=0.15, grain=0, glass=True)
    frame = mat("#cfc4ab", 0.6, metal=0.2, grain=0.03)
    sill = mat("#c7bb9f", 0.8, grain=0.05)

    plaza("#b5aea0", "#9f998c")
    U0, U1, V0, V1 = 0.3, 3.7, 0.25, 1.7
    # Granite base storey with a moulded top course.
    box(U0 - 0.04, V0 - 0.04, U1 - U0 + 0.08, V1 - V0 + 0.08, 3, 6, gran)
    box(U0 - 0.05, V0 - 0.05, U1 - U0 + 0.1, V1 - V0 + 0.1, 9, 0.7, mat("#7c7a75", 0.55, grain=0.08))
    for face, lo, hi, plane, n in (("left", U0, U1, V1 + 0.04, 26), ("right", V0, V1, U1 + 0.04, 11)):
        row(face, lo + 0.04, hi - 0.04, plane, 4.6, 3.0, n, glass, mat("#55534f", 0.5, grain=0), None, fill=0.45, mullion=False)
    # Main block: two giant storeys of limestone with full-height pilasters and tall windows.
    box(U0, V0, U1 - U0, V1 - V0, 9.7, 21, stone)
    for face, lo, hi, plane, n in (("left", U0, U1, V1, 20), ("right", V0, V1, U1, 8)):
        pilasters(face, lo, hi, plane, 9.7, 21, n, light, w=0.05, depth=0.03)
        row(face, lo, hi, plane, 12.0, 6.6, n, glass, frame, sill, fill=0.42, transom=True)
        row(face, lo, hi, plane, 21.4, 6.6, n, glass, frame, sill, fill=0.42, transom=True)
    # Corner pavilions stepped forward, plain walls with a single tall window between paired pilasters.
    for u0 in (U0 - 0.06, U1 - 0.5):
        box(u0, V0 - 0.02, 0.56, V1 - V0 + 0.12, 9.7, 21, stone)
        pilasters("left", u0, u0 + 0.56, V1 + 0.1, 9.7, 21, 1, light, w=0.07, depth=0.03)
        row("left", u0 + 0.1, u0 + 0.46, V1 + 0.1, 12.0, 15.6, 2, glass, frame, sill, fill=0.5, transom=True)
    row("right", V0 + 0.05, V1 + 0.05, U1 + 0.06, 12.0, 15.6, 6, glass, frame, sill, fill=0.42, transom=True)
    # Entablature, cornice and attic with a coping.
    box(U0 - 0.07, V0 - 0.04, U1 - U0 + 0.14, V1 - V0 + 0.2, 30.7, 1.6, light)
    box(U0 - 0.1, V0 - 0.06, U1 - U0 + 0.2, V1 - V0 + 0.24, 32.3, 0.8, mat(SAND_LIGHT, 0.7, grain=0.04))
    box(U0 - 0.04, V0 - 0.02, U1 - U0 + 0.08, V1 - V0 + 0.16, 33.1, 2.6, stone)
    box(U0 - 0.06, V0 - 0.04, U1 - U0 + 0.12, V1 - V0 + 0.2, 35.7, 0.5, light)
    roofing = mat("#8a8a86", 0.9, grain=0.1, scale=40)
    box(U0 + 0.03, V0 + 0.03, U1 - U0 - 0.06, V1 - V0 + 0.08, 36.2, 0.05, roofing)

    # Raised central block behind the portico: clerestory band, cornice.
    C0, C1, CV0, CV1 = 1.25, 2.75, 0.55, 1.45
    box(C0, CV0, C1 - C0, CV1 - CV0, 35.6, 11, stone)
    for face, lo, hi, plane, n in (("left", C0, C1, CV1, 10), ("right", CV0, CV1, C1, 6)):
        pilasters(face, lo, hi, plane, 35.6, 11, n, light, w=0.035)
        row(face, lo, hi, plane, 38.2, 5.6, n, glass, frame, sill, fill=0.48)
    box(C0 - 0.05, CV0 - 0.05, C1 - C0 + 0.1, CV1 - CV0 + 0.1, 46.6, 1.0, light)
    box(C0 + 0.02, CV0 + 0.02, C1 - C0 - 0.04, CV1 - CV0 - 0.04, 47.6, 1.4, stone)
    box(C0 + 0.05, CV0 + 0.05, C1 - C0 - 0.1, CV1 - CV0 - 0.1, 49.0, 0.05, roofing)

    # Giant portico: eight round columns over a raised granite floor, entablature with the emblem, deep shade behind.
    P0, P1, PV = 1.3, 2.7, 2.0
    box(P0 - 0.06, V1, P1 - P0 + 0.12, PV - V1 + 0.06, 3, 6.7, gran)
    box(P0, V1 + 0.005, P1 - P0, 0.004, 9.7, 21, mat("#4d4840", 0.9, grain=0.03))
    door = mat("#2a2724", 0.4, metal=0.3, grain=0)
    for i in range(3):
        c = P0 + (i + 1) * (P1 - P0) / 4
        put("left", c - 0.08, c + 0.08, V1 + 0.01, 9.7, 9.5, 0.006, door)
        put("left", c - 0.1, c + 0.1, V1 + 0.01, 19.2, 0.7, 0.012, light)
    for i in range(8):
        column(P0 + (i + 0.5) * (P1 - P0) / 8, PV - 0.03, 9.7, 21, 0.038, light, stone, 24)
    box(P0 - 0.08, V1, P1 - P0 + 0.16, PV - V1 + 0.04, 30.7, 2.6, light)
    box(P0 - 0.1, V1, P1 - P0 + 0.2, PV - V1 + 0.07, 33.3, 0.9, mat(SAND_LIGHT, 0.7, grain=0.04))
    box(P0 - 0.06, V1, P1 - P0 + 0.12, PV - V1 + 0.04, 34.2, 3.4, stone)
    box(P0, V1, P1 - P0, PV - V1 - 0.02, 37.6, 0.05, roofing)
    # State emblem: a gilded disc on a red-green field, framed by wreaths, on the attic.
    box(1.88, PV + 0.04, 0.24, 0.006, 34.6, 2.8, mat("#b9a36a", 0.4, metal=0.6, grain=0.04))
    box(1.94, PV + 0.045, 0.12, 0.006, 35.0, 2.0, mat("#2f6b45", 0.6, grain=0.02))
    box(1.94, PV + 0.045, 0.12, 0.007, 36.0, 1.0, mat("#a8392f", 0.6, grain=0.02))
    # Lettering blocks along the architrave.
    for i in range(14):
        box(1.55 + i * 0.065, PV + 0.045, 0.04, 0.004, 31.4, 1.0, mat("#8d7b52", 0.5, metal=0.5, grain=0))
    steps(P0 - 0.02, P1 + 0.02, 2.36, 9.7, 8, 0.045, mat("#a19d95", 0.7, grain=0.1, scale=30))

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-belarus", (4, D), HEIGHT)

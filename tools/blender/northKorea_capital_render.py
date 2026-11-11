"""
North Korea's contested capital, "Pyongyang Palace": the Kumsusan Palace of the Sun (Pyongyang, 1976).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/northKorea_capital_render.py

Writes ui/public/sprites/building-nation-northKorea.png (then run tools/to_webp.py).

Real building: a long, strictly symmetrical palace of pale granite on a high terrace; a giant order of square
pillars along the main front with tall windows between them; a tall central entrance block standing forward with a
colonnade of square pillars, a heavy cornice and a stepped attic carrying a red panel with gold lettering; long
plain corner pavilions; flat roofs behind a parapet; a very wide flight of steps down to the plaza.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 64 art px (NationCapital.ts HEIGHTS).
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

HEIGHT = 64

GRANITE = "#d8d1c5"     # pale pink-grey granite
GRANITE_DARK = "#aaa293"


def build():
    stone = mat(GRANITE, 0.75, grain=0.1, scale=26)
    light = mat("#e8e2d7", 0.7, grain=0.05)
    dark = mat(GRANITE_DARK, 0.8, grain=0.12, scale=24)
    glass = mat("#28323a", 0.1, metal=0.2, grain=0, glass=True)
    frame = mat("#9aa0a2", 0.45, metal=0.5, grain=0)
    sill = mat("#c9c1b2", 0.8, grain=0.05)
    roofing = mat("#7f8180", 0.9, grain=0.1, scale=40)

    plaza("#b9b3a7", "#a29c90")
    # High terrace with a moulded edge.
    box(0.2, 0.12, 3.6, 1.86, 3, 5, dark)
    box(0.18, 0.1, 3.64, 1.9, 8, 0.7, light)
    U0, U1, V0, V1 = 0.35, 3.65, 0.3, 1.72
    box(U0, V0, U1 - U0, V1 - V0, 8.7, 20, stone)
    for face, lo, hi, plane, n in (("left", U0 + 0.55, U1 - 0.55, V1, 16), ("right", V0, V1, U1, 9)):
        pilasters(face, lo, hi, plane, 8.7, 20, n, light, w=0.06, depth=0.035)
        row(face, lo, hi, plane, 10.6, 16.0, n, glass, frame, sill, fill=0.4, transom=True)
    # Corner pavilions: plain granite walls, stepped forward, framed by wide pilasters.
    for u0 in (U0 - 0.05, U1 - 0.5):
        box(u0, V0 - 0.03, 0.55, V1 - V0 + 0.14, 8.7, 21, stone)
        pilasters("left", u0, u0 + 0.55, V1 + 0.11, 8.7, 21, 1, light, w=0.08, depth=0.03)
        opening("left", u0 + 0.2, u0 + 0.35, V1 + 0.11, 12, 13, glass, frame, sill, transom=True)
        box(u0 - 0.03, V0 - 0.05, 0.61, V1 - V0 + 0.2, 29.7, 1.6, light)
    pilasters("right", V0 - 0.03, V1 + 0.11, U1 + 0.05, 8.7, 21, 6, light, w=0.06, depth=0.03)
    row("right", V0 - 0.03, V1 + 0.11, U1 + 0.05, 10.6, 16.0, 6, glass, frame, sill, fill=0.4, transom=True)
    # Cornice, frieze and parapet round the roof.
    box(U0 - 0.05, V0 - 0.04, U1 - U0 + 0.1, V1 - V0 + 0.1, 28.7, 1.0, light)
    box(U0 - 0.08, V0 - 0.06, U1 - U0 + 0.16, V1 - V0 + 0.14, 29.7, 1.0, light)
    box(U0 - 0.03, V0 - 0.02, U1 - U0 + 0.06, V1 - V0 + 0.06, 30.7, 2.4, stone)
    box(U0 - 0.05, V0 - 0.04, U1 - U0 + 0.1, V1 - V0 + 0.1, 33.1, 0.5, light)
    box(U0 + 0.03, V0 + 0.03, U1 - U0 - 0.06, V1 - V0, 33.6, 0.05, roofing)

    # Central entrance block standing forward: square-pillar colonnade, cornice, stepped attic, red panel.
    C0, C1, CV1 = 1.35, 2.65, 2.02
    box(C0, V0 + 0.2, C1 - C0, CV1 - V0 - 0.2 - 0.28, 8.7, 31, stone)
    box(C0 + 0.02, CV1 - 0.29, C1 - C0 - 0.04, 0.004, 8.7, 22, mat("#3e3b37", 0.9, grain=0.03))
    door = mat("#4a3a2c", 0.6, grain=0.05)
    for i in range(3):
        c = C0 + (i + 1) * (C1 - C0) / 4
        put("left", c - 0.09, c + 0.09, CV1 - 0.285, 8.7, 11, 0.008, door)
        opening("left", c - 0.08, c + 0.08, CV1 - 0.285, 22, 6, glass, frame, None)
    sq = mat("#ede7dc", 0.65, grain=0.05)
    for i in range(7):
        c = C0 + 0.06 + i * (C1 - C0 - 0.12) / 6
        box(c - 0.04, CV1 - 0.1, 0.08, 0.08, 8.7, 22, sq)
        box(c - 0.05, CV1 - 0.11, 0.1, 0.1, 8.7, 0.8, light)
        box(c - 0.05, CV1 - 0.11, 0.1, 0.1, 29.9, 0.8, light)
    box(C0 - 0.04, V0 + 0.15, C1 - C0 + 0.08, CV1 - V0 - 0.13, 30.7, 2.2, light)
    box(C0 - 0.07, V0 + 0.13, C1 - C0 + 0.14, CV1 - V0 - 0.08, 32.9, 0.9, light)
    box(C0 + 0.05, V0 + 0.3, C1 - C0 - 0.1, CV1 - V0 - 0.42, 33.8, 7, stone)
    box(C0 + 0.02, V0 + 0.27, C1 - C0 - 0.04, CV1 - V0 - 0.36, 40.8, 0.8, light)
    box(C0 + 0.2, V0 + 0.45, C1 - C0 - 0.4, CV1 - V0 - 0.72, 41.6, 3.5, stone)
    box(C0 + 0.18, V0 + 0.43, C1 - C0 - 0.36, CV1 - V0 - 0.68, 45.1, 0.6, light)
    box(C0 + 0.22, V0 + 0.47, C1 - C0 - 0.44, CV1 - V0 - 0.76, 45.7, 0.05, roofing)
    pv = CV1 - 0.12
    box(C0 + 0.25, pv, C1 - C0 - 0.5, 0.008, 34.8, 5, mat("#a8322b", 0.7, grain=0.04))
    gold = mat("#c9a650", 0.35, metal=0.8, grain=0)
    for i in range(9):
        box(C0 + 0.32 + i * 0.075, pv + 0.006, 0.05, 0.004, 36.2, 2.2, gold)
    # Very wide flight of steps to the plaza.
    steps(0.9, 3.1, 2.38, 8.7, 9, 0.04, mat("#c2bbad", 0.75, grain=0.1, scale=30))

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-northKorea", (4, D), HEIGHT)

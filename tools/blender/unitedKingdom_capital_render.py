"""
The United Kingdom's contested capital: 10 Downing Street (Westminster, London; terrace of 1682-84, front refaced 1766).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/unitedKingdom_capital_render.py

Writes ui/public/sprites/building-nation-unitedKingdom.png (then run tools/to_webp.py).

Real building: a plain Georgian terrace (Nos. 10, 11 and 12) of brick blackened by soot; three storeys over a
basement area behind black iron railings, an attic in a slate roof with dormers; white-painted six-over-six sash
windows in plain openings; a white stone cornice band and parapet; tall brick chimney stacks with clay pots; the
black door of No. 10 with its white doorcase, fanlight, the white "10" and the lantern on its bracket above.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The street
front faces +v (lower left on screen), the side faces +u. Picture height 66 art px (NationCapital.ts HEIGHTS).
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

HEIGHT = 66


def sash(face, a0, a1, plane, z, h, glass, white, sill):
    """Georgian sash window: white frame, meeting rail, glazing bars (six over six), stone sill."""
    opening(face, a0, a1, plane, z, h, glass, white, sill, mullion=False)
    put(face, a0, a1, plane, z + h / 2 - 0.3, 0.6, 0.012, white)
    for k in (1, 2):
        c = a0 + (a1 - a0) * k / 3
        put(face, c - 0.003, c + 0.003, plane, z, h, 0.009, white)
    for zz in (z + h / 4, z + 3 * h / 4):
        put(face, a0, a1, plane, zz - 0.15, 0.3, 0.009, white)


def build():
    brick = mat("#2c2a27", 0.9, grain=0.22, scale=70)
    white = mat("#f1efe9", 0.6, grain=0.02)
    stone = mat("#dad6cc", 0.75, grain=0.06)
    glass = mat("#2a3238", 0.08, metal=0.2, grain=0, glass=True)
    slate = mat("#4b5157", 0.65, grain=0.12, scale=70)
    iron = mat("#121212", 0.4, metal=0.6, grain=0)

    plaza("#8f8c86", "#7b7873")  # Downing Street's paving
    U0, U1, V0, V1 = 0.25, 3.75, 0.3, 1.85
    step = (U1 - U0) / 12
    doors = (4, 8)  # bays of the doors of No. 10 and No. 11
    # The black brick terrace, its basement light-well along the front.
    box(U0, V0, U1 - U0, V1 - V0, 3, 30, brick)
    box(U0, V1, U1 - U0, 0.2, 3, 0.15, mat("#3a3936", 0.9, grain=0.05))
    for face, lo, hi, plane, n in (("left", U0, U1, V1, 12), ("right", V0, V1, U1, 5)):
        st = (hi - lo) / n
        for i in range(n):
            c = lo + (i + 0.5) * st
            a0, a1 = c - st * 0.24, c + st * 0.24
            if not (face == "left" and i in doors):
                sash(face, a0, a1, plane, 5.5, 6.8, glass, white, stone)
            sash(face, a0, a1, plane, 15.0, 7.4, glass, white, stone)
            sash(face, a0, a1, plane, 24.6, 4.4, glass, white, stone)
    # Brick string course, the white cornice band and the parapet with its coping.
    box(U0 - 0.01, V0 - 0.01, U1 - U0 + 0.02, V1 - V0 + 0.02, 13.4, 0.5, mat("#3a3733", 0.9, grain=0.1))
    box(U0 - 0.04, V0 - 0.04, U1 - U0 + 0.08, V1 - V0 + 0.08, 30.0, 1.2, white)
    box(U0 - 0.06, V0 - 0.06, U1 - U0 + 0.12, V1 - V0 + 0.12, 31.2, 0.5, white)
    for a in ((U0, V1 - 0.04, U1 - U0, 0.04), (U1 - 0.04, V0, 0.04, V1 - V0), (U0, V0, U1 - U0, 0.04), (U0, V0, 0.04, V1 - V0)):
        box(a[0], a[1], a[2], a[3], 31.7, 2.2, brick)
    box(U0 - 0.01, V1 - 0.05, U1 - U0 + 0.02, 0.06, 33.9, 0.5, stone)
    box(U1 - 0.05, V0 - 0.01, 0.06, V1 - V0 + 0.02, 33.9, 0.5, stone)
    # Slate roof behind the parapet, dormers in the front slope.
    roof(U0 + 0.04, V0 + 0.04, U1 - U0 - 0.08, V1 - V0 - 0.08, 31.7, 13, slate, kind="hip", ridge="u", overhang=0.0)
    for i in range(0, 12, 2):
        c = U0 + (i + 1) * step
        box(c - 0.07, V1 - 0.4, 0.14, 0.16, 33.0, 5.4, slate)
        opening("left", c - 0.045, c + 0.045, V1 - 0.24, 33.8, 3.4, glass, white, None)
        roof(c - 0.07, V1 - 0.4, 0.14, 0.16, 38.4, 2.2, slate, kind="gable", ridge="v", overhang=0.01)
    # Chimney stacks on the party walls with clay pots.
    pot = mat("#9e5a3f", 0.8, grain=0.1)
    for u in (0.3, 1.12, 2.0, 2.88, 3.5):
        box(u, 0.85, 0.2, 0.45, 30, 19, brick)
        box(u - 0.012, 0.838, 0.224, 0.474, 49, 1.0, stone)
        for k in range(3):
            cylinder(u + 0.1, 0.92 + k * 0.15, 0.035, 50, 3.2, pot, 12)

    # Doors: No. 10 (black, white doorcase, fanlight, the "10", lantern on its bracket) and No. 11.
    for i in doors:
        c = U0 + (i + 0.5) * step
        put("left", c - 0.11, c + 0.11, V1, 3.0, 13.6, 0.022, white)
        put("left", c - 0.075, c + 0.075, V1, 4.4, 8.8, 0.026, mat("#0c0c0e", 0.2, grain=0))
        put("left", c - 0.075, c + 0.075, V1, 13.6, 2.2, 0.026, mat("#e3d48a", 0.3, emit="#9a8040"))
        put("left", c - 0.13, c + 0.13, V1, 16.6, 0.8, 0.045, white)
        box(c - 0.1, V1, 0.2, 0.22, 3.0, 1.4, stone)  # front step bridging the area
        if i == 4:
            put("left", c - 0.02, c + 0.02, V1, 9.6, 1.2, 0.03, white)
            rod((c, V1 + 0.04, zp(19.4)), (c, V1 + 0.13, zp(19.4)), 0.005, iron, 4)
            box(c - 0.025, V1 + 0.1, 0.05, 0.05, 16.0, 2.8, mat("#f2e6b0", 0.3, emit="#f2e6b0"))
            box(c - 0.03, V1 + 0.095, 0.06, 0.06, 18.8, 0.6, iron)
    # Black iron railings round the basement area.
    for i in range(64):
        u = U0 + 0.02 + i * (U1 - U0 - 0.04) / 63
        if any(abs(u - (U0 + (k + 0.5) * step)) < 0.11 for k in doors):
            continue
        rod((u, V1 + 0.2, zp(3)), (u, V1 + 0.2, zp(9.0)), 0.004, iron, 4)
    for a0, a1 in ((U0, U0 + 4.5 * step - 0.11), (U0 + 4.5 * step + 0.11, U0 + 8.5 * step - 0.11), (U0 + 8.5 * step + 0.11, U1)):
        put("left", a0, a1, V1 + 0.195, 8.4, 0.5, 0.01, iron)

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-unitedKingdom", (4, D), HEIGHT)

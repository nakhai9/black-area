"""
Japan's contested capital, "Tokyo Kantei": the Prime Minister's Official Residence (Nagatacho, Tokyo, 2002).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/japan_capital_render.py

Writes ui/public/sprites/building-nation-japan.png (then run tools/to_webp.py).

Real building: a five-storey modern block of glass and steel over a grey granite base; the fronts are glass curtain
walls screened by slender vertical aluminium louvres (a modern take on bamboo screens), with thin floor slabs
showing as horizontal bands; deep thin roof plates overhanging the glass; a two-storey glass entrance hall under a
cantilevered canopy; rough granite walls framing the entrance; a helipad on the roof.

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


def curtain(u0, v0, u1, v1, z, h, floors, glass, slab, louvre, nl, nr):
    """Glass box with slab edges at every floor and a screen of slim vertical louvres just in front of the glass."""
    box(u0, v0, u1 - u0, v1 - v0, z, h, glass)
    fh = h / floors
    for k in range(floors + 1):
        box(u0 - 0.03, v0 - 0.03, u1 - u0 + 0.06, v1 - v0 + 0.06, z + k * fh - 0.5, 0.7, slab)
    mull = mat("#5b646b", 0.4, metal=0.6, grain=0)
    for face, lo, hi, plane, n in (("left", u0, u1, v1, nl), ("right", v0, v1, u1, nr)):
        for i in range(n // 3 + 1):
            c = lo + i * (hi - lo) / (n // 3)
            put(face, c - 0.004, c + 0.004, plane, z, h, 0.008, mull)
        for i in range(n):
            c = lo + (i + 0.5) * (hi - lo) / n
            put(face, c - 0.006, c + 0.006, plane, z + 0.2, h - 0.4, 0.02, louvre, out=0.022)


def build():
    gran = mat("#8f8b84", 0.8, grain=0.14, scale=30)
    rough = mat("#a29d93", 0.95, grain=0.25, scale=12)
    glass = mat("#3c5866", 0.06, metal=0.25, grain=0, glass=True)
    slab = mat("#e7e8e4", 0.5, metal=0.2, grain=0.02)
    louvre = mat("#cfd3d2", 0.35, metal=0.7, grain=0)
    roofm = mat("#eceee9", 0.45, metal=0.2, grain=0.02)

    plaza("#a9a59c", "#949087")
    # Granite base storey, recessed dark glass under it.
    box(0.3, 0.1, 3.4, 2.15, 3, 4, gran)
    box(0.28, 0.08, 3.44, 2.19, 7, 0.6, mat("#a39f97", 0.7, grain=0.06))
    # Main block: four floors of glass and louvres.
    curtain(0.55, 0.3, 3.45, 1.85, 7.6, 30, 4, glass, slab, louvre, 72, 36)
    # Deep, thin roof plate overhanging the glass all round, its edge fascia, the roof deck.
    box(0.38, 0.14, 3.24, 1.88, 37.6, 1.0, roofm)
    box(0.36, 0.12, 3.28, 1.92, 38.6, 0.5, slab)
    box(0.42, 0.18, 3.16, 1.8, 39.1, 0.05, mat("#8d8f8c", 0.9, grain=0.1, scale=40))
    # Roof storey set back with the helipad on it.
    curtain(1.0, 0.45, 3.0, 1.55, 39.1, 7, 1, glass, slab, louvre, 40, 22)
    box(0.95, 0.4, 2.1, 1.2, 46.1, 0.9, roofm)
    pad = mat("#4c5054", 0.8, grain=0.05)
    box(1.35, 0.5, 1.3, 1.0, 47.0, 0.4, pad)
    mark = mat("#f2f2ee", 0.6, grain=0)
    lathe(2.0, 1.0, 47.4, [(0.42, 0), (0.42, 0.06), (0.38, 0.06), (0.38, 0)], mark, 48, cap_top=True)
    lathe(2.0, 1.0, 47.42, [(0.38, 0), (0.38, 0.05)], pad, 48, cap_top=True)
    box(1.88, 0.86, 0.04, 0.28, 47.5, 0.06, mark)
    box(2.08, 0.86, 0.04, 0.28, 47.5, 0.06, mark)
    box(1.88, 0.98, 0.24, 0.04, 47.5, 0.06, mark)
    edge = mat("#d8b23a", 0.5, grain=0)
    for i in range(12):
        a = i / 12 * 2 * math.pi
        cylinder(2.0 + math.cos(a) * 0.47, 1.0 + math.sin(a) * 0.47, 0.012, 47.4, 0.4, edge, 8)

    # Entrance: two-storey glass hall under a cantilevered canopy, framed by rough granite walls.
    eu0, eu1 = 1.5, 2.5
    box(eu0, 1.85, eu1 - eu0, 0.18, 7.6, 15, mat("#4f7180", 0.05, metal=0.3, grain=0, glass=True))
    for i in range(9):
        c = eu0 + i * (eu1 - eu0) / 8
        box(c - 0.005, 2.03, 0.01, 0.01, 7.6, 15, slab)
    box(eu0, 2.03, eu1 - eu0, 0.01, 15.1, 0.4, slab)
    box(eu0 + 0.4, 2.03, 0.2, 0.012, 7.6, 6.5, mat("#2a2c2d", 0.3, metal=0.5, grain=0))
    box(eu0 - 0.1, 1.8, eu1 - eu0 + 0.2, 0.42, 22.6, 1.0, roofm)
    for u0 in (eu0 - 0.14, eu1):
        box(u0, 1.85, 0.14, 0.22, 3, 19.6, rough)
    steps(eu0 + 0.1, eu1 - 0.1, 2.4, 7.6, 4, 0.04, mat("#9f9b92", 0.75, grain=0.1, scale=30))

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-japan", (4, D), HEIGHT)

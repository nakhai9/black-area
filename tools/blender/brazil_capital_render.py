"""
Brazil's contested capital, "Brasília Planalto": the Palácio do Planalto (Brasília, Oscar Niemeyer, 1960).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/brazil_capital_render.py

Writes ui/public/sprites/building-nation-brazil.png (then run tools/to_webp.py).

Real building: a long, low glass box held between two thin white slabs (the raised floor and the roof), lifted off
the ground; along the long fronts a row of Niemeyer's white "feather" columns, each curving from a point just above
the ground out to the edges of both slabs; a recessed shaded ground storey; a long ramp rising from the square to
the main floor in the middle of the front; a reflecting pool along the front.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 52 art px (NationCapital.ts HEIGHTS).
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

HEIGHT = 52


def feather(u, v, along, z0, zr, half, t, material, n=14):
    """Niemeyer's column, flat in the plane of the front: touches down at a point (z0) and curves out to the roof
    slab (zr), `half` wide there, `t` thick."""
    pts = []
    for i in range(n + 1):  # outer edge from the foot up to the roof
        s = i / n
        pts.append((half * math.sin(math.pi / 2 * s) ** 0.7, z0 + (zr - z0) * s))
    for i in range(n, 0, -1):  # inner edge back down
        s = i / n
        pts.append((-half * 0.75 * math.sin(math.pi / 2 * s) ** 1.4, z0 + (zr - z0) * s))
    bm = bmesh.new()
    layers = []
    for side in (-t / 2, t / 2):
        layer = []
        for o, zz in pts:
            p = (u + o, v + side) if along == "u" else (u + side, v + o)
            layer.append(bm.verts.new((p[0], p[1], zp(zz))))
        layers.append(layer)
    m = len(pts)
    bm.faces.new(layers[0])
    bm.faces.new(list(reversed(layers[1])))
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((layers[0][i], layers[0][j], layers[1][j], layers[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("feather", bm, material)
    for f in ob.data.polygons:
        f.use_smooth = True


def build():
    white = mat("#f3f2ee", 0.5, grain=0.03)
    glass = mat("#33505f", 0.05, metal=0.3, grain=0, glass=True)
    mull = mat("#a9b3b8", 0.35, metal=0.7, grain=0)
    shade = mat("#3a3d40", 0.8, grain=0.03)

    plaza("#c9c3b5", "#b3ad9f")
    U0, U1, V0, V1 = 0.3, 3.7, 0.35, 1.8
    # Recessed, shaded ground storey (glass behind slim posts).
    box(U0 + 0.2, V0 + 0.2, U1 - U0 - 0.4, V1 - V0 - 0.4, 3, 7, shade)
    row("left", U0 + 0.2, U1 - 0.2, V1 - 0.2, 3.6, 5.5, 20, glass, mull, None, fill=0.8)
    row("right", V0 + 0.2, V1 - 0.2, U1 - 0.2, 3.6, 5.5, 8, glass, mull, None, fill=0.8)
    # Raised floor slab, glass box of two floors with mullions and a floor band, roof slab.
    box(U0 - 0.08, V0 - 0.08, U1 - U0 + 0.16, V1 - V0 + 0.16, 10, 1.6, white)
    box(U0, V0, U1 - U0, V1 - V0, 11.6, 16, glass)
    for face, lo, hi, plane, n in (("left", U0, U1, V1, 34), ("right", V0, V1, U1, 15)):
        for i in range(n + 1):
            c = lo + i * (hi - lo) / n
            put(face, c - 0.005, c + 0.005, plane, 11.6, 16, 0.01, mull)
        put(face, lo, hi, plane, 19.2, 0.6, 0.012, mull)
    box(U0 - 0.12, V0 - 0.12, U1 - U0 + 0.24, V1 - V0 + 0.24, 27.6, 2.4, white)
    box(U0 - 0.06, V0 - 0.06, U1 - U0 + 0.12, V1 - V0 + 0.12, 30.0, 0.05, mat("#cfcdc6", 0.85, grain=0.08, scale=40))
    # The feather columns along the main front.
    for i in range(10):
        u = U0 + 0.1 + i * (U1 - U0 - 0.2) / 9
        feather(u, V1 + 0.1, "u", 3.6, 30.0, 0.12, 0.03, white)

    # Long ramp from the square up to the raised floor, with thin rails.
    r0, r1 = 1.87, 2.13
    vf, vb = 2.38, V1 + 0.08
    bm = bmesh.new()
    pts = [(vf, zp(3)), (vb, zp(11.6)), (vb, zp(10.4))]
    a = [bm.verts.new((r0, v, z)) for v, z in pts]
    b = [bm.verts.new((r1, v, z)) for v, z in pts]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("ramp", bm, white)
    for u in (r0 + 0.006, r1 - 0.006):
        rod((u, vf, zp(4.6)), (u, vb, zp(13.2)), 0.006, white, 6)
    # Reflecting pool along the front, either side of the ramp.
    pool = mat("#3f6a80", 0.04, grain=0, glass=True)
    for p0, p1 in ((0.35, 1.6), (2.4, 3.65)):
        box(p0, 2.02, p1 - p0, 0.3, 3, 0.4, mat("#d8d3c6", 0.7, grain=0.04))
        box(p0 + 0.02, 2.04, p1 - p0 - 0.04, 0.26, 3.1, 0.4, pool)

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-brazil", (4, D), HEIGHT)

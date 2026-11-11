"""
Australia's contested capital, "Canberra Parliament": Parliament House on Capital Hill (Canberra, 1988).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/australia_capital_render.py

Writes ui/public/sprites/building-nation-australia.png (then run tools/to_webp.py).

Real building: dug into the hill so that lawns run up over its roof; two great curved granite walls sweep through
it from front to back; on the front the white marble Great Verandah, a long low screen of slender square columns
with a raised centre over the entrance and the coat of arms; in front a forecourt with a shallow pool; on the
middle of the roof the 81 m flagmast, four stainless-steel legs leaning together into a pyramid.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 70 art px (NationCapital.ts HEIGHTS).
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

HEIGHT = 70


def curved_wall(cu, v0, v1, bow, z, h, t, material, n=24):
    """Curved granite wall in plan: runs from v0 to v1 near u = cu, bowing out by `bow` in its middle."""
    inner, outer = [], []
    for i in range(n + 1):
        s = i / n
        v = v0 + (v1 - v0) * s
        u = cu + bow * math.sin(math.pi * s)
        inner.append((u, v))
        outer.append((u + (t if bow > 0 else -t), v))
    poly = inner + list(reversed(outer))
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))
    if area < 0:
        poly.reverse()
    prism(poly, z, h, material)
    prism([(p[0], p[1]) for p in poly], z + h, 0.6, mat("#b9b0a2", 0.7, grain=0.06))


def build():
    gran = mat("#cdbfa9", 0.8, grain=0.12, scale=26)
    marble = mat("#f1eee7", 0.55, grain=0.04)
    glass = mat("#2b3540", 0.08, metal=0.2, grain=0, glass=True)
    grass = mat("#6b8a46", 0.95, grain=0.25, scale=50)
    steel = mat("#cfd3d6", 0.25, metal=0.95, grain=0)

    plaza("#c2b8a6", "#aba294")
    # Low granite halls under the lawns.
    U0, U1, V0, V1 = 0.25, 3.75, 0.3, 1.75
    box(U0, V0, U1 - U0, V1 - V0, 3, 13, gran)
    frame = mat("#8b8f92", 0.4, metal=0.5, grain=0)
    for face, lo, hi, plane, n in (("left", U0, 1.2, V1, 7), ("left", 2.8, U1, V1, 7), ("right", V0, V1, U1, 10)):
        row(face, lo + 0.03, hi - 0.03, plane, 5.5, 6.0, n, glass, frame, None, fill=0.6, mullion=False)
    box(U0 - 0.03, V0 - 0.03, U1 - U0 + 0.06, V1 - V0 + 0.06, 16, 0.8, mat("#ddd5c6", 0.7, grain=0.05))
    # Lawns over the roof, sloping down to the ground at both ends, as on Capital Hill.
    box(U0 + 0.02, V0 + 0.02, U1 - U0 - 0.04, V1 - V0 - 0.04, 16.8, 0.5, grass)
    for u_lo, u_hi, up in ((0.0, U0 + 0.4, True), (U1 - 0.4, 4.0, False)):
        bm = bmesh.new()
        zl, zh = zp(3), zp(17.3)
        pts = [(u_lo, zl), (u_hi, zh if up else zl), (u_hi, zl)] if up else [(u_lo, zl), (u_lo, zh), (u_hi, zl)]
        ring = []
        for v in (V0, V1):
            ring.append([bm.verts.new((p[0], v, p[1])) for p in pts])
        bm.faces.new(ring[0])
        bm.faces.new(list(reversed(ring[1])))
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((ring[0][i], ring[0][j], ring[1][j], ring[1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _obj("lawn_ramp", bm, grass)

    # The two great curved walls, bowing outward, rising above the lawns.
    curved_wall(1.25, 0.2, 1.85, -0.35, 3, 21, 0.07, gran)
    curved_wall(2.75, 0.2, 1.85, 0.35, 3, 21, 0.07, gran)

    # Great Verandah: white marble screen of slim square columns, raised centre with the coat of arms.
    G0, G1, GV = 1.15, 2.85, 2.05
    box(G0, V1, G1 - G0, GV - V1 - 0.1, 3, 14, glass)
    box(G0 - 0.04, V1 - 0.02, G1 - G0 + 0.08, GV - V1 + 0.03, 3, 1.2, marble)
    for i in range(23):
        c = G0 + 0.02 + i * (G1 - G0 - 0.04) / 22
        box(c - 0.014, GV - 0.04, 0.028, 0.028, 4.2, 12.6, marble)
    box(G0 - 0.04, V1 - 0.02, G1 - G0 + 0.08, GV - V1 + 0.03, 16.8, 1.6, marble)
    C0, C1 = 1.7, 2.3
    box(C0, V1 + 0.02, C1 - C0, GV - V1 - 0.06, 18.4, 6.5, marble)
    for i in range(9):
        c = C0 + 0.02 + i * (C1 - C0 - 0.04) / 8
        box(c - 0.012, GV - 0.06, 0.024, 0.024, 18.4, 5.2, marble)
    box(C0 + 0.01, V1 + 0.04, C1 - C0 - 0.02, 0.004, 18.4, 5.2, mat("#3e4247", 0.8, grain=0))
    box(C0 - 0.02, V1, C1 - C0 + 0.04, GV - V1 - 0.02, 24.9, 1.2, marble)
    box(C0 + 0.02, V1 + 0.02, C1 - C0 - 0.04, GV - V1 - 0.06, 26.1, 0.05, mat("#bdb8ae", 0.85, grain=0.08))
    box(1.93, GV - 0.035, 0.14, 0.006, 18.9, 3.6, mat("#b89a52", 0.4, metal=0.7, grain=0.03))  # coat of arms

    # Forecourt pool.
    pool = mat("#3d5f72", 0.05, grain=0, glass=True)
    box(1.35, 2.1, 1.3, 0.22, 3, 0.3, mat("#c9c0b0", 0.8, grain=0.05))
    box(1.38, 2.13, 1.24, 0.16, 3.1, 0.3, pool)

    # Flagmast: four stainless legs from the corners of the roof court leaning into a pyramid, then the mast.
    cu, cv, top = 2.0, 1.0, 60
    for du, dv in ((-0.42, -0.42), (0.42, -0.42), (-0.42, 0.42), (0.42, 0.42)):
        cylinder(cu + du, cv + dv, 0.03, 17.3, 1.0, mat("#a9a194", 0.8, grain=0.05), 12)
        rod((cu + du, cv + dv, zp(18.3)), (cu + du * 0.04, cv + dv * 0.04, zp(top)), 0.014, steel, 10)
    rod((cu, cv, zp(top - 2)), (cu, cv, zp(69)), 0.008, steel, 8)

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-australia", (4, D), HEIGHT)

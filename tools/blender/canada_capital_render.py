"""
Canada's contested capital, "Parliament Hill": the Centre Block and Peace Tower (Ottawa, 1916-27), the Library of
Parliament behind.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/canada_capital_render.py

Writes ui/public/sprites/building-nation-canada.png (then run tools/to_webp.py).

Real building: Gothic Revival in cream Nepean sandstone with lighter Ohio sandstone trim; a long front of three
storeys of pointed-arch windows between buttresses, a pinnacled parapet, a steep green copper roof with dormers;
square end pavilions with steep pyramid roofs; in the middle the Peace Tower: a tall square shaft with corner
buttresses and a deep pointed entrance arch, tall lancet windows, a clock stage with a clock on each face and corner
turrets, and a green copper spire with a flagstaff; behind, the round Library with its buttresses and conical roof.
A lawn and a central walk in front.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 128 art px (NationCapital.ts HEIGHTS).
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

HEIGHT = 128


def plate(face, pts, plane, depth, material):
    """Flat slab of outline pts [(a, z art px), ...] standing on a visible face, `depth` proud of it."""
    bm = bmesh.new()
    layers = []
    for off in (0.0, depth):
        layer = []
        for a, zz in pts:
            p = (a, plane + off) if face == "left" else (plane + off, a)
            layer.append(bm.verts.new((p[0], p[1], zp(zz))))
        layers.append(layer)
    n = len(pts)
    bm.faces.new(layers[0])
    bm.faces.new(list(reversed(layers[1])))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((layers[0][i], layers[0][j], layers[1][j], layers[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("plate", bm, material)


def lancet_outline(a0, a1, z, h, k=8):
    """Pointed (Gothic) arch outline: straight jambs, then two arcs meeting at a point."""
    w = a1 - a0
    rise = min(h * 0.35, w * 45)
    pts = [(a0, z), (a1, z), (a1, z + h - rise)]
    for i in range(1, k + 1):
        t = i / k
        pts.append((a1 - w / 2 * (1 - math.cos(t * math.pi / 2)), z + h - rise + rise * math.sin(t * math.pi / 2)))
    for i in range(k - 1, -1, -1):
        t = i / k
        pts.append((a0 + w / 2 * (1 - math.cos(t * math.pi / 2)), z + h - rise + rise * math.sin(t * math.pi / 2)))
    return pts


def lancet(face, a0, a1, plane, z, h, glass, trim):
    """Pointed-arch window: a trim surround standing proud, the dark glass set back inside it, a centre mullion."""
    b = (a1 - a0) * 0.18
    plate(face, lancet_outline(a0 - b, a1 + b, z - 0.6, h + 1.0), plane, 0.008, trim)
    plate(face, lancet_outline(a0, a1, z, h), plane, 0.012, glass)
    put(face, (a0 + a1) / 2 - 0.003, (a0 + a1) / 2 + 0.003, plane, z, h * 0.8, 0.016, trim)
    put(face, a0 - b, a1 + b, plane, z - 1.2, 0.6, 0.02, trim)


def lancets(face, lo, hi, plane, z, h, n, glass, trim, fill=0.45):
    st = (hi - lo) / n
    for i in range(n):
        c = lo + (i + 0.5) * st
        lancet(face, c - st * fill / 2, c + st * fill / 2, plane, z, h, glass, trim)


def buttresses(face, lo, hi, plane, z, h, n, material, w=0.03):
    """Stepped buttresses between the bays, each with a little gabled cap."""
    st = (hi - lo) / n
    for i in range(n + 1):
        c = lo + i * st
        put(face, c - w / 2, c + w / 2, plane, z, h * 0.6, 0.04, material)
        put(face, c - w / 2, c + w / 2, plane, z + h * 0.6, h * 0.4, 0.025, material)


def pinnacle(u, v, z, h, stone, copper):
    box(u - 0.025, v - 0.025, 0.05, 0.05, z, h * 0.45, stone)
    roof(u - 0.025, v - 0.025, 0.05, 0.05, z + h * 0.45, h * 0.55, copper, kind="pyramid", overhang=0.004)


def crenel(face, lo, hi, plane, z, material, n):
    """Parapet with embrasures (open notches) along a visible face."""
    put(face, lo, hi, plane - 0.03, z, 1.2, 0.03, material)
    st = (hi - lo) / n
    for i in range(n):
        put(face, lo + i * st, lo + i * st + st * 0.55, plane - 0.03, z + 1.2, 1.2, 0.03, material)


def build():
    sand = mat("#cdbf98", 0.85, grain=0.18, scale=30)       # Nepean sandstone
    trim = mat("#e4dcc4", 0.75, grain=0.06)                 # Ohio sandstone trim
    copper = mat("#6a9f86", 0.55, metal=0.3, grain=0.15, scale=40)
    copper_dk = mat("#4e7f6a", 0.55, metal=0.3, grain=0.1)
    glass = mat("#2f363e", 0.1, metal=0.15, grain=0, glass=True)
    grass = mat("#6b8f45", 0.95, grain=0.25, scale=50)

    plaza("#b2ab9b", "#9c9586")
    box(0.05, 1.9, 1.75, 0.45, 3, 0.4, grass)
    box(2.2, 1.9, 1.75, 0.45, 3, 0.4, grass)

    # Library of Parliament behind: sixteen-sided hall, flying-buttress piers, conical roof, lantern.
    cylinder(2.0, 0.42, 0.34, 3, 22, sand, 16)
    for i in range(16):
        a = (i + 0.5) / 16 * 2 * math.pi
        box(2.0 + math.cos(a) * 0.39 - 0.025, 0.42 + math.sin(a) * 0.39 - 0.025, 0.05, 0.05, 3, 19, sand)
        pinnacle(2.0 + math.cos(a) * 0.39, 0.42 + math.sin(a) * 0.39, 22, 6, trim, copper_dk)
    lathe(2.0, 0.42, 25, [(0.37, 0), (0.29, 8), (0.13, 17), (0.08, 19)], copper, 32, cap_bottom=True)
    cylinder(2.0, 0.42, 0.08, 44, 6, trim, 16)
    lathe(2.0, 0.42, 50, [(0.09, 0), (0.05, 5), (0.005, 11)], copper_dk, 16, cap_bottom=True)

    # Centre Block: three storeys of lancet windows between buttresses, pinnacled parapet, steep copper roof.
    U0, U1, V0, V1 = 0.55, 3.45, 0.85, 1.85
    box(U0, V0, U1 - U0, V1 - V0, 3, 27, sand)
    box(U0 - 0.02, V0 - 0.02, U1 - U0 + 0.04, V1 - V0 + 0.04, 3, 3.5, trim)
    for face, lo, hi, plane, n in (("left", U0, 1.75, V1, 6), ("left", 2.25, U1, V1, 6), ("right", V0, V1, U1, 5)):
        buttresses(face, lo, hi, plane, 3, 27, n, sand)
        lancets(face, lo, hi, plane, 7.5, 5.0, n, glass, trim)
        lancets(face, lo, hi, plane, 15.0, 5.0, n, glass, trim)
        lancets(face, lo, hi, plane, 22.0, 3.6, n, glass, trim)
        for zz in (13.2, 20.6):
            put(face, lo, hi, plane, zz, 0.6, 0.015, trim)
        crenel(face, lo, hi, plane + 0.03, 28.2, trim, n * 3)
    box(U0 - 0.03, V0 - 0.03, U1 - U0 + 0.06, V1 - V0 + 0.06, 27.0, 1.2, trim)
    roof(U0 + 0.04, V0 + 0.04, U1 - U0 - 0.08, V1 - V0 - 0.08, 28.2, 20, copper, kind="hip", ridge="u", overhang=0.0)
    for i in range(10):  # dormers in the front slope
        c = U0 + 0.2 + i * (U1 - U0 - 0.4) / 9
        if abs(c - 2.0) < 0.3:
            continue
        box(c - 0.05, V1 - 0.32, 0.1, 0.14, 29.5, 6.0, trim)
        opening("left", c - 0.025, c + 0.025, V1 - 0.18, 30.6, 3.2, glass, trim, None, mullion=False)
        roof(c - 0.05, V1 - 0.32, 0.1, 0.14, 35.5, 3.5, copper_dk, kind="gable", ridge="v", overhang=0.008)
    box(U0 + 0.4, (V0 + V1) / 2 - 0.02, U1 - U0 - 0.8, 0.04, 47.8, 1.0, copper_dk)  # iron cresting on the ridge
    for i in range(12):
        c = U0 + 0.4 + i * (U1 - U0 - 0.8) / 11
        rod((c, (V0 + V1) / 2, zp(48.6)), (c, (V0 + V1) / 2, zp(52)), 0.005, copper_dk, 4)

    # End pavilions: square, a storey higher, steep pyramid copper roofs with corner pinnacles.
    for u0 in (0.3, 3.2):
        P0, P1 = 0.95, 1.55
        box(u0, P0, 0.5, P1 - P0 + 0.36, 3, 32, sand)
        for face, lo, hi, plane, n in (("left", u0, u0 + 0.5, P1 + 0.36, 2), ("right", P0, P1 + 0.36, u0 + 0.5, 3)):
            buttresses(face, lo, hi, plane, 3, 32, n, sand)
            lancets(face, lo, hi, plane, 7.5, 5.0, n, glass, trim)
            lancets(face, lo, hi, plane, 15.0, 5.0, n, glass, trim)
            lancets(face, lo, hi, plane, 22.0, 6.5, n, glass, trim)
        box(u0 - 0.03, P0 - 0.03, 0.56, P1 - P0 + 0.42, 32, 1.4, trim)
        roof(u0, P0, 0.5, P1 - P0 + 0.36, 33.4, 26, copper, kind="hip", ridge="v", overhang=0.0)
        for pu, pv in ((u0, P0), (u0 + 0.5, P0), (u0, P1 + 0.36), (u0 + 0.5, P1 + 0.36)):
            pinnacle(pu, pv, 33.4, 9, trim, copper_dk)

    # Peace Tower: square shaft with corner buttresses, deep pointed entrance arch, tall lancets, clock stage with a
    # clock on each face and corner turrets, the copper spire and its flagstaff.
    T0, T1, TV0, TV1 = 1.78, 2.22, 1.62, 2.06
    box(T0, TV0, T1 - T0, TV1 - TV0, 3, 84, sand)
    for pu, pv in ((T0, TV1), (T1, TV1), (T1, TV0), (T0, TV0)):
        box(pu - 0.035, pv - 0.035, 0.07, 0.07, 3, 80, sand)
    plate("left", lancet_outline(1.88, 2.12, 3, 15), TV1, 0.01, trim)
    plate("left", lancet_outline(1.92, 2.08, 3, 13), TV1, 0.014, mat("#2a2622", 0.9, grain=0))
    for face, lo, hi, plane in (("left", T0, T1, TV1), ("right", TV0, TV1, T1)):
        if face == "right":
            lancets(face, lo, hi, plane, 8, 10, 2, glass, trim, fill=0.5)
        lancets(face, lo, hi, plane, 24, 22, 2, glass, trim, fill=0.5)
        lancets(face, lo, hi, plane, 52, 18, 2, glass, trim, fill=0.5)
        for zz in (21, 48, 73):
            put(face, lo, hi, plane, zz, 1.0, 0.02, trim)
    # Clock stage.
    box(T0 - 0.04, TV0 - 0.04, T1 - T0 + 0.08, TV1 - TV0 + 0.08, 84, 12, trim)
    face_m = mat("#f4efe0", 0.5, grain=0.02)
    hand = mat("#1d1d1d", 0.5, grain=0)
    gold = mat("#b8973f", 0.35, metal=0.8, grain=0)
    for face, mid, plane in (("left", 2.0, TV1 + 0.04), ("right", (TV0 + TV1) / 2, T1 + 0.04)):
        plate(face, [(mid + 0.13 * math.cos(a / 24 * 2 * math.pi), 90 + 4.6 * math.sin(a / 24 * 2 * math.pi)) for a in range(24)], plane, 0.008, gold)
        plate(face, [(mid + 0.11 * math.cos(a / 24 * 2 * math.pi), 90 + 3.9 * math.sin(a / 24 * 2 * math.pi)) for a in range(24)], plane, 0.012, face_m)
        put(face, mid - 0.006, mid + 0.006, plane, 90, 3.2, 0.016, hand)
        put(face, mid - 0.006, mid + 0.07, plane, 89.6, 0.7, 0.016, hand)
    for pu, pv in ((T0 - 0.04, TV1 + 0.04), (T1 + 0.04, TV1 + 0.04), (T1 + 0.04, TV0 - 0.04), (T0 - 0.04, TV0 - 0.04)):
        cylinder(pu, pv, 0.04, 84, 16, trim, 12)
        lathe(pu, pv, 100, [(0.045, 0), (0.005, 9)], copper_dk, 12, cap_bottom=True)
    box(T0 - 0.05, TV0 - 0.05, T1 - T0 + 0.1, TV1 - TV0 + 0.1, 96, 1.2, trim)
    crenel("left", T0 - 0.05, T1 + 0.05, TV1 + 0.05, 97.2, trim, 6)
    crenel("right", TV0 - 0.05, TV1 + 0.05, T1 + 0.05, 97.2, trim, 6)
    # Spire: steep copper pyramid with small lucarnes, a slim finial and the flagstaff.
    roof(T0 + 0.01, TV0 + 0.01, T1 - T0 - 0.02, TV1 - TV0 - 0.02, 97.2, 22, copper, kind="pyramid", overhang=0.0)
    for face, mid, plane in (("left", 2.0, TV1 - 0.08), ("right", (TV0 + TV1) / 2, T1 - 0.08)):
        put(face, mid - 0.03, mid + 0.03, plane, 101, 4.5, 0.05, copper_dk)
    rod((2.0, (TV0 + TV1) / 2, zp(118)), (2.0, (TV0 + TV1) / 2, zp(126)), 0.007, mat("#d8d8d8", 0.3, metal=0.9, grain=0))
    # Walk and steps to the tower arch.
    steps(1.86, 2.14, 2.3, 4.5, 3, 0.06, trim)

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-canada", (4, D), HEIGHT)

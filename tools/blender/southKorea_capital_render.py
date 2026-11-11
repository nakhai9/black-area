"""
South Korea's contested capital, "Seoul Blue House": the main building of Cheong Wa Dae (Seoul, 1991).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P tools/blender/southKorea_capital_render.py

Writes ui/public/sprites/building-nation-southKorea.png (then run tools/to_webp.py).

Real building: a two-storey hall in traditional Korean palace style on a granite terrace; pale stone walls behind a
row of square stone pillars, dark wooden lattice windows between them; a painted (dancheong) green bracket band
under the eaves; the famous roof of blue glazed tiles (some 150 000 of them), hip-and-gable (paljak) with a concave
sweep and upturned corners, a heavy dark ridge; two lower side wings with their own blue roofs; a wide stair up the
terrace in front.

Game plot: authored in 4 x 2.4 art units like every contested capital (drawn 1.25x onto the 5 x 3 plot). The main
front faces +v (lower left on screen), the side faces +u. Picture height 62 art px (NationCapital.ts HEIGHTS).
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

HEIGHT = 62

TILE = "#3d68a6"      # blue glazed roof tiles
RIDGE = "#2a3f63"
WALL = "#ece6d8"
GRANITE = "#c9c3b6"


def tiled_roof(u0, v0, u1, v1, z, h, material, lift=2.5, gable=0.55, ribs=26, thick=0.6, n=None):
    """Korean hip-and-gable roof over (u0, v0)-(u1, v1) from eave height z, h art px to the ridge (along u):
    a concave sweep (flat at the eaves, steep near the ridge), corners lifted by `lift`, hips that stop at `gable`
    of the half-depth and end in a gable above, and tile ribs (rows of round tiles) running down every slope."""
    hd = (v1 - v0) / 2
    nu = n or int((u1 - u0) * 160)
    nv = int((v1 - v0) * 160)
    bm = bmesh.new()
    grid = []
    for j in range(nv + 1):
        y = v0 + (v1 - v0) * j / nv
        line = []
        for i in range(nu + 1):
            x = u0 + (u1 - u0) * i / nu
            du, dv = min(x - u0, u1 - x), min(y - v0, v1 - y)
            ts, tf = du / hd, dv / hd
            side = ts < gable and ts < tf
            t = ts if side else tf
            t = min(t, 1.0)
            hz = h * t ** 1.6
            c = max(0.0, 1 - (du + dv) / (hd * 0.9))
            hz += lift * c * c
            a = (y if side else x) * ribs
            hz += 0.35 * abs(math.cos(math.pi * a)) ** 3 * min(1.0, t * 6) * (1 - t * 0.6)
            line.append(bm.verts.new((x, y, zp(z + hz))))
        grid.append(line)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    ob = _obj("tiled_roof", bm, material)
    for f in ob.data.polygons:
        f.use_smooth = True
    mod = ob.modifiers.new("solid", "SOLIDIFY")
    mod.thickness = zp(thick)
    mod.offset = -1
    return ob


def ridge(u0, u1, v, z, h):
    """Heavy dark ridge beam with raised end ornaments."""
    m = mat(RIDGE, 0.5, grain=0.05)
    box(u0, v - 0.035, u1 - u0, 0.07, z, h, m)
    for u in (u0, u1 - 0.05):
        box(u, v - 0.04, 0.05, 0.08, z, h + 2.2, m)


def hall(u0, v0, u1, v1, z, h, stone, wall, wood, glass, band, pillars_l, pillars_r):
    """Walls behind square stone pillars, dark lattice windows between them, the green bracket band under the eaves."""
    box(u0, v0, u1 - u0, v1 - v0, z, h, wall)
    for face, lo, hi, plane, n in (("left", u0, u1, v1, pillars_l), ("right", v0, v1, u1, pillars_r)):
        step = (hi - lo) / n
        for i in range(n):
            c = lo + (i + 0.5) * step
            a0, a1 = c - step * 0.3, c + step * 0.3
            put(face, a0, a1, plane, z + 1.2, h - 3.2, 0.004, glass)
            for k in range(5):
                q = a0 + (a1 - a0) * k / 4
                put(face, q - 0.004, q + 0.004, plane, z + 1.2, h - 3.2, 0.012, wood)
            for zz in (z + 1.2, z + h * 0.5, z + h - 2.4):
                put(face, a0, a1, plane, zz, 0.5, 0.013, wood)
        for i in range(n + 1):
            c = lo + i * step
            put(face, c - 0.03, c + 0.03, plane, z, h, 0.05, stone)
    box(u0 - 0.05, v0 - 0.05, u1 - u0 + 0.1, v1 - v0 + 0.1, z + h, 1.0, wood)
    box(u0 - 0.08, v0 - 0.08, u1 - u0 + 0.16, v1 - v0 + 0.16, z + h + 1.0, 1.0, band)
    reds = mat("#8c3a2e", 0.7, grain=0.04)
    for face, lo, hi, plane in (("left", u0 - 0.08, u1 + 0.08, v1 + 0.08), ("right", v0 - 0.08, v1 + 0.08, u1 + 0.08)):
        k = int((hi - lo) / 0.06)
        for i in range(k):
            c = lo + (i + 0.5) * (hi - lo) / k
            put(face, c - 0.008, c + 0.008, plane, z + h + 1.2, 0.6, 0.008, reds)


def build():
    stone = mat("#dcd6ca", 0.7, grain=0.06)
    wall = mat(WALL, 0.8, grain=0.05)
    gran = mat(GRANITE, 0.8, grain=0.14, scale=26)
    wood = mat("#4b3426", 0.75, grain=0.06)
    glass = mat("#2b2e30", 0.1, metal=0.1, grain=0, glass=True)
    band = mat("#3f7a62", 0.7, grain=0.05)
    tile = mat(TILE, 0.35, metal=0.15, grain=0.08, scale=60)

    plaza("#b9b4a8", "#a39e92")
    # Granite terrace in two tiers with a moulded edge.
    box(0.2, 0.15, 3.6, 2.0, 3, 3, gran)
    box(0.18, 0.13, 3.64, 2.04, 6, 0.6, stone)
    box(0.9, 0.35, 2.2, 1.55, 6.6, 2.0, gran)
    box(0.88, 0.33, 2.24, 1.59, 8.6, 0.5, stone)

    # Side wings, one storey, own blue roofs.
    for u0, u1 in ((0.35, 1.15), (2.85, 3.65)):
        hall(u0, 0.65, u1, 1.6, 6.6, 10, stone, wall, wood, glass, band, 4, 4)
        tiled_roof(u0 - 0.17, 0.48, u1 + 0.17, 1.77, 18.6, 9, tile, lift=1.6, gable=0.6, thick=0.7)
        ridge(u0 + 0.1, u1 - 0.1, 1.125, 27.4, 1.6)

    # Main hall: two storeys, pillars, lattice windows, a balcony rail between the floors.
    hall(1.1, 0.6, 2.9, 1.65, 9.1, 17, stone, wall, wood, glass, band, 7, 4)
    rail = mat("#6b4a36", 0.7, grain=0.05)
    balustrade("left", 1.1, 2.9, 1.7, 17.4, rail, h=1.6)
    balustrade("right", 0.6, 1.65, 2.95, 17.4, rail, h=1.6)
    box(1.06, 0.56, 1.88, 1.16, 17.0, 0.5, stone)
    tiled_roof(0.8, 0.32, 3.2, 1.93, 28.1, 17, tile, lift=3.2, gable=0.52, thick=0.9)
    ridge(1.22, 2.78, 1.125, 44.6, 2.2)

    # Wide stair up both terrace tiers in the middle of the front.
    steps(1.55, 2.45, 2.42, 6.6, 5, 0.05, mat("#d0cabd", 0.75, grain=0.1, scale=30))
    steps(1.65, 2.35, 2.12, 9.1, 3, 0.07, mat("#d0cabd", 0.75, grain=0.1, scale=30), ground=6.6)

    poles()


kit.reset()
build()
smooth_round_parts()
render("nation-southKorea", (4, D), HEIGHT)

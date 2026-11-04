"""Capitals of the contested nations, authored in 4 x 2.4 art units (the game draws them 1.25x onto the 5 x 3 plot).
Each nation's seat of government as in NationCapital.ts; the flags stay animated in the game."""
import math

import bmesh

from kit import _obj, box, cylinder, dome, lathe, mat, prism, render, rod, roof, windows, zp

D = 2.4
GLASS = "#34424e"


def stone(c, s=22, g=0.12):
    return mat(c, 0.85, grain=g, scale=s)


def facade(u, v, w, d, z, h, cols_l, cols_r, floors, glass=GLASS, frame="#efece4", band=None):
    g = mat(glass, 0.15, metal=0.1, grain=0, glass=True)
    f = mat(frame, 0.7, grain=0.04)
    for k in range(floors):
        fz, fh = z + k * h / floors, h / floors
        windows("left", u, v, w, d, fz, fh, cols_l, 1, g, f, margin=0.05, fill=0.5)
        windows("right", u, v, w, d, fz, fh, cols_r, 1, g, f, margin=0.05, fill=0.5)
        if band and k:
            box(u - 0.01, v - 0.01, w + 0.02, d + 0.02, fz - 0.4, 0.8, mat(band, 0.8, grain=0.05))


def column(u, v, z, h, r, material):
    cylinder(u, v, r, z, h, material, 16)
    box(u - r * 1.4, v - r * 1.4, r * 2.8, r * 2.8, z, 0.8, material)
    box(u - r * 1.4, v - r * 1.4, r * 2.8, r * 2.8, z + h - 0.8, 0.8, material)


def colonnade(face, u, v, w, d, z, h, n, material, r=0.035):
    for i in range(n):
        t = (i + 0.5) / n
        if face == "left":
            column(u + t * w, v + d, z, h, r, material)
        else:
            column(u + w, v + t * d, z, h, r, material)


def parapet(u, v, w, d, z, material, t=0.05, h=2):
    for a in ((u, v, w, t), (u, v + d - t, w, t), (u, v + t, t, d - 2 * t), (u + w - t, v + t, t, d - 2 * t)):
        box(a[0], a[1], a[2], a[3], z, h, material)


def plaza():
    box(0, 0, 4, D, 0, 3, mat("#a8a294", 0.95, grain=0.14, scale=10))
    j = mat("#958f81", 0.95, grain=0.05)
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


def belarus():
    S = stone("#e6e1d6")
    box(0.3, 0.1, 3.4, 2.2, 3, 4, stone("#b8b2a4"))
    box(0.45, 0.3, 3.1, 1.6, 7, 20, S)
    facade(0.45, 0.3, 3.1, 1.6, 7, 20, 16, 9, 3, band="#cdc7b9")
    parapet(0.45, 0.3, 3.1, 1.6, 27, stone("#d6d0c2"))
    box(0.5, 0.35, 3.0, 1.5, 26.8, 0.3, mat("#7d8286", 0.8, grain=0.05))
    box(1.2, 0.6, 1.6, 1.1, 27, 9, S)
    windows("right", 1.2, 0.6, 1.6, 1.1, 27, 9, 4, 1, mat(GLASS, 0.15, glass=True))
    box(1.15, 0.55, 1.7, 1.2, 36, 1, mat("#9aa0a4", 0.6, metal=0.3))
    # Tall portico in front of the raised hall, wide stair.
    colonnade("left", 1.1, 2.1, 1.8, 0.0, 7, 22, 8, mat("#f7f5ef", 0.6, grain=0.05), r=0.05)
    box(1.05, 1.7, 1.9, 0.5, 29, 2.2, stone("#f2efe8"))
    box(1.05, 1.9, 1.9, 0.3, 7, 0.6, stone("#f2efe8"))
    for k in range(4):
        box(1.2, 2.2, 1.6, 0.16 - k * 0.04, 3, 1 + k, stone("#c4bead"))


def north_korea():
    W = stone("#d6d2c6")
    box(0.3, 0.15, 3.4, 1.95, 3, 4, stone("#9c978a"))
    box(0.4, 0.25, 3.2, 1.75, 7, 22, W)
    facade(0.4, 0.25, 3.2, 1.75, 7, 22, 18, 10, 3, band="#b9b4a6")
    parapet(0.4, 0.25, 3.2, 1.75, 29, stone("#c9c5b8"))
    box(0.45, 0.3, 3.1, 1.65, 28.8, 0.3, mat("#6f7376", 0.8))
    box(1.4, 0.65, 1.2, 1.0, 29, 10, W)
    box(1.35, 0.6, 1.3, 1.1, 39, 1.2, stone("#c9c5b8"))
    box(1.64, 1.65, 0.72, 0.012, 31, 7, mat("#c8302a", 0.7, grain=0.05))
    box(1.5, 2.0, 1.0, 0.35, 7, 14, stone("#b9b4a6"))
    box(1.7, 2.35, 0.6, 0.012, 7, 11, mat("#3a3630", 0.9, grain=0))
    colonnade("left", 1.5, 2.0, 1.0, 0.35, 7, 14, 4, stone("#e8e4d8"), r=0.04)
    box(1.45, 1.95, 1.1, 0.45, 21, 1.4, W)


def south_korea():
    box(0.3, 0.1, 3.4, 2.15, 3, 5, stone("#cfc8b6"))
    for k in range(3):
        box(1.5, 2.25 + k * 0.05, 1.0, 0.07, 3, 5 - k * 1.6, stone("#bfb8a6"))
    box(0.65, 0.45, 2.7, 1.35, 8, 14, stone("#efe9da", g=0.06))
    red = mat("#7a2a20", 0.7, grain=0.08)
    colonnade("left", 0.6, 0.4, 2.8, 1.45, 8, 14, 10, red, r=0.045)
    colonnade("right", 0.6, 0.4, 2.8, 1.45, 8, 14, 6, red, r=0.045)
    lat = mat("#a8523a", 0.8, grain=0.05)
    for i in range(9):
        box(0.78 + i * 0.28, 1.8, 0.14, 0.01, 9, 10, lat)
    box(0.55, 0.35, 2.9, 1.55, 21, 1.2, mat("#2e7d5e", 0.7, grain=0.05))
    # Blue-tiled roof: a wide hipped lower slope and a steeper gabled upper one, as on the Blue House.
    blue = mat("#2f5fa8", 0.45, metal=0.15, grain=0.1, scale=60)
    roof(0.6, 0.4, 2.8, 1.45, 22, 6, blue, kind="hip", ridge="u", overhang=0.28)
    roof(0.85, 0.6, 2.3, 1.05, 26, 10, blue, kind="gable", ridge="u", overhang=0.05)
    box(0.85, 1.11, 2.3, 0.08, 35.5, 1.5, mat("#26487e", 0.5, grain=0.05))


def japan():
    G = mat("#9c988e", 0.8, grain=0.1, scale=30)
    gl = mat("#4b6878", 0.08, metal=0.2, grain=0, glass=True)
    box(0.3, 0.1, 3.4, 2.2, 3, 4, G)
    box(0.6, 0.35, 2.8, 1.55, 7, 12, gl)
    steel = mat("#e6e8e4", 0.4, metal=0.5, grain=0)
    colonnade("left", 0.5, 0.25, 3.0, 1.75, 7, 12, 14, steel, r=0.018)
    colonnade("right", 0.5, 0.25, 3.0, 1.75, 7, 12, 8, steel, r=0.018)
    box(0.5, 0.25, 3.0, 1.75, 19, 18, gl)
    lv = mat("#d9dcd8", 0.5, metal=0.3, grain=0)
    for i in range(30):
        box(0.5 + (i + 0.5) * 3.0 / 30, 2.0, 0.012, 0.04, 19, 18, lv)
    for i in range(18):
        box(3.5, 0.25 + (i + 0.5) * 1.75 / 18, 0.04, 0.012, 19, 18, lv)
    for z in (25, 31):
        box(0.49, 0.24, 3.02, 1.77, z, 0.6, steel)
    box(0.25, 0.05, 3.5, 2.1, 37, 1.6, mat("#e9ebe7", 0.5, grain=0.03))
    box(1.2, 0.7, 1.4, 0.8, 38.6, 3, mat("#8d9398", 0.6, metal=0.4))
    box(1.4, 2.0, 1.0, 0.3, 7, 8, mat("#6f8c9a", 0.08, glass=True, grain=0))
    box(1.3, 1.95, 1.2, 0.4, 15, 1, steel)
    for u in (0.4, 3.2):
        box(u, 1.95, 0.4, 0.3, 7, 1.5, mat("#3f6b3a", 0.9, grain=0.3, scale=60))


def australia():
    R = stone("#f3efe6", g=0.06)
    tile = mat("#b5603e", 0.8, grain=0.2, scale=50)
    box(0.5, 0.25, 3.0, 1.55, 3, 22, R)
    facade(0.5, 0.25, 3.0, 1.55, 3, 22, 9, 5, 2, glass="#3d4a52", frame="#ffffff")
    sh = mat("#3f6a43", 0.7, grain=0.05)
    for i in range(9):
        s0 = 0.5 + 3.0 * (0.05 + 0.9 * (i + 0.5) / 9)
        for k in range(2):
            for o in (-0.13, 0.1):
                box(s0 + o, 1.8, 0.03, 0.01, 6 + k * 11, 6, sh)
    box(0.47, 0.22, 3.06, 1.61, 24.5, 1, stone("#ffffff"))
    roof(0.5, 0.25, 3.0, 1.55, 25, 12, tile, kind="hip", ridge="u", overhang=0.12)
    for u in (1.0, 3.0):
        box(u - 0.1, 0.75, 0.2, 0.3, 30, 12, R)
        box(u - 0.12, 0.73, 0.24, 0.34, 42, 1.5, stone("#d8d2c4"))
    box(1.6, 1.8, 0.8, 0.45, 3, 1.5, stone("#e4ded2"))
    colonnade("left", 1.6, 1.8, 0.8, 0.45, 4.5, 14, 4, stone("#ffffff", g=0.03), r=0.04)
    box(1.55, 1.78, 0.9, 0.5, 18.5, 2, stone("#ffffff", g=0.03))
    roof(1.55, 1.78, 0.9, 0.5, 20.5, 6, tile, kind="gable", ridge="v", overhang=0.03)
    lawn = mat("#5d8a3e", 0.95, grain=0.25, scale=40)
    box(0.2, 1.85, 1.3, 0.45, 3, 0.4, lawn)
    box(2.5, 1.85, 1.3, 0.45, 3, 0.4, lawn)


def sail(u, v, along, material):
    """Niemeyer's sail column: wide under the roof, tapering to a point just above the base."""
    pts = [(-0.14, 22), (0.14, 22), (0.05, 12), (0, 4.5), (-0.02, 12)]
    bm = bmesh.new()
    verts = []
    for o, z in pts:
        for side in (-0.015, 0.015):
            verts.append(bm.verts.new((u + o, v + side, zp(z)) if along == "u" else (u + side, v + o, zp(z))))
    n = len(pts)
    bm.faces.new([verts[2 * i] for i in range(n)])
    bm.faces.new([verts[2 * i + 1] for i in reversed(range(n))])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((verts[2 * i], verts[2 * j], verts[2 * j + 1], verts[2 * i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("sail", bm, material)


def brazil():
    W = mat("#f4f2ec", 0.6, grain=0.04)
    box(0.3, 0.2, 3.4, 1.9, 4, 2, W)
    box(0.55, 0.45, 2.9, 1.4, 6, 16, mat("#2e4656", 0.06, metal=0.3, grain=0, glass=True))
    mull = mat("#9aa8b2", 0.4, metal=0.6, grain=0)
    for i in range(21):
        box(0.55 + i * 2.9 / 20 - 0.006, 1.85, 0.012, 0.01, 6, 16, mull)
    for i in range(11):
        box(3.45, 0.45 + i * 1.4 / 10 - 0.006, 0.01, 0.012, 6, 16, mull)
    box(0.54, 0.44, 2.92, 1.42, 13.6, 0.8, mull)
    box(0.25, 0.15, 3.5, 2.0, 22, 2.5, W)
    white = mat("#ffffff", 0.45, grain=0.02)
    for i in range(7):
        sail(0.55 + i * 0.48, 2.12, "u", white)
    for i in range(4):
        sail(3.72, 0.35 + i * 0.5, "v", white)
    pool = mat("#3e6f86", 0.05, grain=0, glass=True)
    box(0.35, 2.15, 1.15, 0.2, 3, 0.3, pool)
    box(2.5, 2.15, 1.15, 0.2, 3, 0.3, pool)
    for k in range(6):
        box(1.6, 2.1, 0.8, 0.3 - k * 0.05, 3, 0.5 + k * 0.5, W)


def united_kingdom():
    B = mat("#2b2a28", 0.9, grain=0.2, scale=60)
    box(0.1, 2.05, 3.8, 0.35, 3, 0.5, stone("#8d8a82"))
    box(0.3, 0.3, 3.4, 1.75, 3, 26, B)
    facade(0.3, 0.3, 3.4, 1.75, 3, 26, 9, 5, 3, glass="#3b4650", frame="#f2f0ea")
    box(0.25, 0.25, 3.5, 1.85, 29, 1.5, stone("#e8e5dc"))
    roof(0.3, 0.3, 3.4, 1.75, 30.5, 9, mat("#4a4f55", 0.7, grain=0.12, scale=60), kind="hip", ridge="u", overhang=0.0)
    pot = mat("#a4553a", 0.8, grain=0.1)
    for u in (0.7, 1.6, 2.5, 3.3):
        box(u, 0.95, 0.22, 0.4, 30, 16, B)
        box(u - 0.01, 0.94, 0.24, 0.42, 45, 1, B)
        cylinder(u + 0.11, 1.05, 0.04, 46, 3, pot, 12)
        cylinder(u + 0.11, 1.25, 0.04, 46, 3, pot, 12)
    # No 10: black door in its white case, fanlight, the white "10", step.
    du = 0.3 + 3.4 * 0.38
    box(du - 0.04, 2.05, 0.27, 0.02, 3, 11, stone("#f2f0ea", g=0.02))
    box(du, 2.06, 0.19, 0.02, 3.5, 8.5, mat("#0d0d0f", 0.25, grain=0))
    box(du, 2.06, 0.19, 0.021, 12.3, 1.6, mat("#e9d27a", 0.3, emit="#a08030"))
    box(du + 0.08, 2.08, 0.04, 0.005, 8.5, 1.2, mat("#ffffff", 0.5, grain=0))
    box(du - 0.05, 2.05, 0.29, 0.08, 3, 0.8, stone("#d8d5cc"))
    iron = mat("#111111", 0.4, metal=0.6, grain=0)
    for i in range(29):
        u = 0.4 + i * 0.11
        if abs(u - du - 0.1) < 0.2:
            continue
        rod((u, 2.18, zp(3.5)), (u, 2.18, zp(9)), 0.006, iron, 4)
    rod((0.4, 2.18, zp(8.5)), (du - 0.1, 2.18, zp(8.5)), 0.006, iron, 4)
    rod((du + 0.3, 2.18, zp(8.5)), (3.5, 2.18, zp(8.5)), 0.006, iron, 4)
    rod((du + 0.1, 2.14, zp(3)), (du + 0.1, 2.14, zp(17)), 0.01, iron, 6)
    box(du + 0.06, 2.1, 0.08, 0.08, 17, 3, mat("#f4e7b0", 0.3, emit="#f4e7b0"))


def canada():
    S = stone("#d6c9a8", 30, 0.16)
    C = mat("#5fa287", 0.55, metal=0.3, grain=0.15, scale=40)
    DK = mat("#467d68", 0.55, metal=0.3, grain=0.1)
    gl = mat("#36404c", 0.15, glass=True)
    fr = stone("#ece3cb")
    box(0.1, 0.05, 3.8, 2.3, 3, 0.3, mat("#7aa04c", 0.95, grain=0.3, scale=50))
    # Library of Parliament: sixteen-sided hall, buttresses, conical copper roof, lantern.
    cylinder(2.0, 0.5, 0.38, 3, 19, S, 16)
    for i in range(8):
        a = i / 8 * 2 * math.pi
        box(2.0 + math.cos(a) * 0.43 - 0.04, 0.5 + math.sin(a) * 0.43 - 0.04, 0.08, 0.08, 3, 17, S)
    lathe(2.0, 0.5, 22, [(0.4, 0), (0.3, 8), (0.12, 16), (0.08, 18)], C, 16, cap_bottom=True)
    cylinder(2.0, 0.5, 0.08, 40, 6, stone("#e8e0c8"), 12)
    roof(1.92, 0.42, 0.16, 0.16, 46, 8, DK, kind="pyramid", overhang=0)
    # Centre Block.
    box(0.45, 0.85, 3.1, 1.1, 3, 23, S)
    facade(0.45, 0.85, 3.1, 1.1, 6, 20, 22, 8, 3, glass="#36404c", frame="#ece3cb")
    roof(0.45, 0.85, 3.1, 1.1, 26, 12, C, kind="hip", ridge="u", overhang=0.03)
    for i in range(13):
        u = 0.5 + i * 0.25
        box(u - 0.03, 1.91, 0.06, 0.06, 26, 4, stone("#e2d7bb"))
        roof(u - 0.03, 1.91, 0.06, 0.06, 30, 4, DK, kind="pyramid", overhang=0)
    for u in (0.35, 3.15):
        box(u, 0.8, 0.5, 0.5, 3, 28, S)
        roof(u, 0.8, 0.5, 0.5, 31, 14, C, kind="pyramid", overhang=0.02)
        box(u, 1.5, 0.5, 0.5, 3, 26, S)
        windows("left", u, 1.5, 0.5, 0.5, 6, 20, 2, 3, gl, fr)
        windows("right", u, 1.5, 0.5, 0.5, 6, 20, 2, 3, gl, fr)
        roof(u, 1.5, 0.5, 0.5, 29, 12, C, kind="pyramid", overhang=0.02)
    # Peace Tower: shaft, entrance arch, clock stage with corner turrets, copper spire.
    box(1.78, 1.85, 0.44, 0.44, 3, 73, S)
    box(1.9, 2.29, 0.2, 0.01, 3, 12, mat("#3a332c", 0.9, grain=0))
    for f in ("left", "right"):
        windows(f, 1.78, 1.85, 0.44, 0.44, 25, 46, 2, 3, mat("#4a4f58", 0.2, glass=True), S, margin=0.15, fill=0.45)
    box(1.74, 1.81, 0.52, 0.52, 76, 10, stone("#e2d7bb"))
    face = mat("#f6f1e2", 0.6, grain=0.02)
    box(1.86, 2.33, 0.28, 0.01, 77.5, 7, face)
    box(2.26, 1.93, 0.01, 0.28, 77.5, 7, face)
    hand = mat("#2a2a2a", 0.5, grain=0)
    box(1.995, 2.345, 0.01, 0.005, 80.5, 3, hand)
    box(2.275, 2.06, 0.005, 0.1, 80.8, 0.6, hand)
    for u, v in ((1.74, 1.81), (2.2, 1.81), (1.74, 2.27), (2.2, 2.27)):
        box(u, v, 0.06, 0.06, 86, 4, S)
        roof(u, v, 0.06, 0.06, 90, 5, DK, kind="pyramid", overhang=0)
    roof(1.78, 1.85, 0.44, 0.44, 86, 30, C, kind="pyramid", overhang=0)
    rod((2.0, 2.07, zp(116)), (2.0, 2.07, zp(124)), 0.008, mat("#d8d8d8", 0.3, metal=0.9, grain=0))


def cuba():
    S = stone("#ece6d6", 26, 0.1)
    box(0.2, 0.15, 3.6, 1.9, 3, 5, stone("#cfc8b4"))
    box(0.3, 0.3, 3.4, 1.5, 8, 16, S)
    facade(0.3, 0.3, 3.4, 1.5, 8, 16, 24, 10, 2, glass="#3a3f46", frame="#f6f2e8")
    parapet(0.3, 0.3, 3.4, 1.5, 24, S, 0.04, 1.5)
    box(0.33, 0.33, 3.34, 1.44, 23.8, 0.4, stone("#d9d3c2"))
    # Portico over the stair, pediment on top.
    colonnade("left", 1.45, 1.85, 1.1, 0.0, 8, 16, 6, S, r=0.045)
    colonnade("left", 1.45, 2.05, 1.1, 0.0, 8, 16, 6, S, r=0.045)
    box(1.42, 1.78, 1.16, 0.34, 24, 3, S)
    roof(1.42, 1.78, 1.16, 0.34, 27, 5, stone("#f4efe2"), kind="gable", ridge="v", overhang=0.02)
    for k in range(10):
        box(1.5, 2.1, 1.0, 0.3 - k * 0.03, 3, 0.5 + k * 0.5, stone("#e3ddcc"))
    # Drum with pilasters and windows, ribbed dome, lantern.
    cylinder(2.0, 1.05, 0.55, 24, 22, S, 32)
    dark = mat("#3a3f46", 0.2, glass=True)
    for i in range(16):
        a = i / 16 * 2 * math.pi
        cylinder(2.0 + math.cos(a) * 0.56, 1.05 + math.sin(a) * 0.56, 0.025, 24, 20, S, 8)
        b = (i + 0.5) / 16 * 2 * math.pi
        box(2.0 + math.cos(b) * 0.55 - 0.03, 1.05 + math.sin(b) * 0.55 - 0.03, 0.06, 0.06, 30, 10, dark)
    cylinder(2.0, 1.05, 0.58, 46, 4, stone("#e2dccb"), 32)
    dome(2.0, 1.05, 0.5, 50, 26, mat("#d9d2bf", 0.6, metal=0.1, grain=0.1, scale=30), 48, 14)
    cylinder(2.0, 1.05, 0.1, 76, 8, S, 12)
    for i in range(6):
        a = i / 6 * 2 * math.pi
        cylinder(2.0 + math.cos(a) * 0.1, 1.05 + math.sin(a) * 0.1, 0.014, 76, 8, S, 6)
    dome(2.0, 1.05, 0.12, 84, 4, mat("#d9d2bf", 0.6))
    rod((2.0, 1.05, zp(88)), (2.0, 1.05, zp(94)), 0.01, mat("#c9b46a", 0.3, metal=0.9, grain=0))


PALACES = {
    "belarus": (belarus, 60),
    "northKorea": (north_korea, 64),
    "southKorea": (south_korea, 62),
    "japan": (japan, 64),
    "australia": (australia, 70),
    "brazil": (brazil, 52),
    "unitedKingdom": (united_kingdom, 66),
    "canada": (canada, 128),
    "cuba": (cuba, 96),
}


def capital(nation):
    draw, height = PALACES[nation]
    plaza()
    draw()
    poles()
    render(f"nation-{nation}", (4, D), height)


MODELS = {f"nation-{n}": (lambda n=n: capital(n)) for n in PALACES}

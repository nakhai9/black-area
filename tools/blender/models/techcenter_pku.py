"""China High-Tech Center (4 × 5): Peking University Library filling its whole plot — a wide, symmetric cream-stone
block running the 5-cell length (v): lower flat-roofed wings at both ends, a taller centre with deep recessed balconies,
a dark timber top storey under a huge grey-tiled hip roof with flared, upturned eaves and ridge ornaments, the entrance
under a curved canopy and broad steps on the front (+u) side."""
import bmesh

from kit import _obj, box, cylinder, mat, render, rod, windows, zp, TEAM
from models._chinese_roof import curved_roof

CREAM = "#e4ddcc"
CREAM_D = "#cfc7b4"
TILE = "#5d6166"
TIMBER = "#4a3a2c"
GLASS = "#3a4d5e"
FRAME = "#efeadd"

def emblem(u, cv, cz, r, red, gold):
    """National emblem hung on a +u facing wall at u: a red disc (r tiles, centre cv / cz art px) in a gold rim, a large
    gold five-pointed star with four small ones in an arc beneath it, standing out from the disc."""
    import math

    def plate(points, du, depth, material):
        bm = bmesh.new()
        front = [bm.verts.new((u + du + depth, v, zp(z))) for v, z in points]
        back = [bm.verts.new((u + du, v, zp(z))) for v, z in points]
        n = len(points)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((back[i], back[j], front[j], front[i]))
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _obj("emblem", bm, material)

    rz = r * 32 / 0.866 / 1.35 * 0.7071  # the disc's radius in art px up, so it reads round
    ring = [(cv + r * math.cos(a), cz + rz * math.sin(a)) for a in (2 * math.pi * i / 40 for i in range(40))]
    plate([(cv + r * 1.12 * math.cos(a), cz + rz * 1.12 * math.sin(a)) for a in (2 * math.pi * i / 40 for i in range(40))], 0.0, 0.02, gold)
    plate(ring, 0.02, 0.02, red)
    def star(sv, sz, size):
        pts = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5
            rr = size if k % 2 == 0 else size * 0.4
            pts.append((sv - r * rr * math.cos(a), sz + rz * rr * math.sin(a)))
        plate(pts, 0.04, 0.02, gold)

    # One large star, four small ones in an arc beneath it.
    star(cv, cz + rz * 0.2, 0.45)
    for k in range(4):
        a = math.radians(-125 + k * 23.3)
        star(cv + r * 0.62 * math.cos(a), cz + rz * 0.62 * math.sin(a), 0.14)


# Building depth (u) and the front face; length runs along v over the whole plot.
U0, U1 = 0.1, 3.55
FRONT = U1


def pku():
    cream = mat(CREAM, 0.75, grain=0.1, scale=20)
    cream_d = mat(CREAM_D, 0.8, grain=0.12, scale=20)
    tile = mat(TILE, 0.6, grain=0.15, scale=70)
    tile_d = mat("#45484c", 0.6, grain=0.1, scale=70)
    timber = mat(TIMBER, 0.8, grain=0.1)
    red = mat("#8e2a1e", 0.7, grain=0.05)
    glass = mat(GLASS, 0.1, grain=0, glass=True)
    frame = mat(FRAME, 0.6, grain=0)
    dark = mat("#2b2f33", 0.6, grain=0)
    gold = mat(TEAM["china"], 0.35, metal=0.6, grain=0)

    # Stone terrace over the whole plot (its paving sunk flush by kit.render) and broad steps on the front.
    box(0.02, 0.02, 3.96, 4.96, 0, 1, cream_d)
    for k in range(3):
        box(FRONT + k * 0.12, 1.6 - k * 0.1, 0.14, 1.8 + k * 0.2, 1, 3 - k, cream_d)

    # End wings (four floors, flat roofs with a parapet) at both ends of the length.
    for v, d in ((0.05, 1.35), (3.6, 1.35)):
        box(U0 + 0.15, v, U1 - U0 - 0.3, d, 1, 28, cream)
        windows("right", U0 + 0.15, v, U1 - U0 - 0.3, d, 1, 28, 3, 4, glass, frame, margin=0.1, fill=0.6)
        windows("left", U0 + 0.15, v, U1 - U0 - 0.3, d, 1, 28, 5, 4, glass, frame, margin=0.08, fill=0.55)
        for a in ((U0 + 0.13, v - 0.02, U1 - U0 - 0.26, 0.05), (U0 + 0.13, v + d - 0.03, U1 - U0 - 0.26, 0.05),
                  (U0 + 0.13, v - 0.02, 0.05, d + 0.04), (U1 - 0.2, v - 0.02, 0.05, d + 0.04)):
            box(*a, 29, 1.6, cream_d)

    # Centre block: taller, deep recessed balcony bands across its front (+u) face.
    v0, d = 1.4, 2.2
    box(U0, v0, U1 - U0, d, 1, 32, cream)
    for f in range(4):
        z = 4 + f * 7
        box(U1 - 0.02, v0 + 0.15, 0.03, d - 0.3, z, 4.6, dark)
        box(U1 - 0.01, v0 + 0.15, 0.05, d - 0.3, z - 0.4, 0.5, cream_d)
        for k in range(1, 7):
            box(U1 - 0.01, v0 + 0.15 + k * (d - 0.3) / 7 - 0.015, 0.03, 0.03, z, 4.6, cream)
    windows("left", U0, v0, U1 - U0, d, 1, 32, 6, 4, glass, frame, margin=0.06, fill=0.55)
    # Bay towers framing the entrance.
    for v in (v0 - 0.05, v0 + d - 0.25):
        box(U1 - 0.3, v, 0.42, 0.3, 1, 32, cream_d)
        windows("right", U1 - 0.3, v, 0.42, 0.3, 3, 26, 1, 4, glass, frame, margin=0.2, fill=0.6)

    # Top storey: dark timber hall with red columns under the great roof.
    tz = 33
    tu0, tu1 = U0 + 0.35, U1 - 0.35
    box(tu0, v0 + 0.05, tu1 - tu0, d - 0.1, tz, 7, timber)
    for k in range(10):
        cylinder(tu1 + 0.03, v0 + 0.08 + k * (d - 0.16) / 9, 0.025, tz, 7, red, 8)
    windows("right", tu0, v0 + 0.05, tu1 - tu0, d - 0.1, tz, 7, 9, 1, glass, mat("#7a2a1e", 0.7, grain=0), margin=0.05, fill=0.6)
    box(tu0 - 0.05, v0, tu1 - tu0 + 0.1, d, tz + 7, 0.8, gold)
    # Great hip roof, ridge along the length: flared skirt with deep overhang, steep upper hip, ridge ornaments, upturned corners.
    rz = tz + 7.8
    ru, rw = tu0 - 0.05, tu1 - tu0 + 0.1
    # Painted bracket band (dougong) under the eaves, then the great curved roof.
    box(ru - 0.08, v0 - 0.08, rw + 0.16, d + 0.16, rz - 0.6, 1.4, mat("#2f6f6a", 0.6, grain=0.05))
    curved_roof(ru, v0, rw, d, rz + 0.8, 15, 0.42, tile, tile_d, mat("#5a1e16", 0.7, grain=0))

    # National emblem: gold star on a red disc, hung high on the front above the balconies.
    emblem(U1 + 0.04, 2.5, 26, 0.17, mat("#c8221a", 0.45, grain=0), mat("#e8b84a", 0.3, metal=0.8, grain=0))

    # Entrance: glazed doors under a curved white canopy, on the front face.
    box(FRONT, 2.15, 0.02, 0.7, 1, 6, glass)
    box(FRONT, 2.05, 0.35, 0.9, 7.2, 0.8, frame)
    for v in (2.1, 2.88):
        box(FRONT + 0.3, v, 0.05, 0.05, 1, 6.4, frame)
    # Bronze ding vessels on plinths beside the steps.
    bronze = mat("#6b5a3a", 0.4, metal=0.8, grain=0.05)
    for v in (1.2, 3.8):
        box(3.68, v - 0.12, 0.24, 0.24, 1, 2, cream_d)
        cylinder(3.8, v, 0.09, 3, 3, bronze, 16)
    render("techcenter-china-pku", (4, 5), 68)


MODELS = {"techcenter-china-pku": pku}

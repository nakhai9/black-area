"""Allied Building (4 x 4): a low office wing over the whole plot with the seat of government in the leading nation's
architecture on it. The two flags at the front are drawn in code (they wave). Also holds small architectural helpers
shared by parallelgov.py and flagpole.py."""
import math

from models._rooftop import deck
from kit import box, cylinder, dome, lathe, mat, prism, render, rod, roof, windows, zp, TEAM


# ---------------------------------------------------------------- shared helpers

GLASS = "#2c3a46"
DARK = "#2a2622"
GOLD = "#c9a646"


def glass():
    return mat(GLASS, 0.1, grain=0, glass=True)


def cornice(u, v, w, d, z, h, m, over=0.04):
    box(u - over, v - over, w + 2 * over, d + 2 * over, z, h, m)


def parapet(u, v, w, d, z, h, m, t=0.05):
    box(u, v, w, t, z, h, m)
    box(u, v + d - t, w, t, z, h, m)
    box(u, v + t, t, d - 2 * t, z, h, m)
    box(u + w - t, v + t, t, d - 2 * t, z, h, m)


def facade(u, v, w, d, z, h, cols_l, cols_r, rows, frame, fill=0.5, margin=0.08):
    """Windows with sills on both visible faces of a box."""
    windows("left", u, v, w, d, z, h, cols_l, rows, glass(), frame, margin=margin, fill=fill)
    windows("right", u, v, w, d, z, h, cols_r, rows, glass(), frame, margin=margin, fill=fill)


def door(face, u, v, w, d, z, s0, s1, h, m=None, frame=None):
    """Door on a face between fractions s0..s1 of its width (from the face's low-u / high-v end)."""
    m = m or mat(DARK, 0.5, grain=0)
    if face == "left":
        if frame is not None:
            box(u + s0 * w - 0.03, v + d, (s1 - s0) * w + 0.06, 0.015, z, h + 1, frame)
        box(u + s0 * w, v + d, (s1 - s0) * w, 0.025, z, h, m)
    else:
        if frame is not None:
            box(u + w, v + d - s1 * d - 0.03, 0.015, (s1 - s0) * d + 0.06, z, h + 1, frame)
        box(u + w, v + d - s1 * d, 0.025, (s1 - s0) * d, z, h, m)


def steps(u, v, w, z, n, depth, rise, m, along="v"):
    """Flight of n steps against a front face at v, running out toward +v."""
    for i in range(n):
        box(u, v, w, depth * (n - i), z + rise * i, rise, m)


def columns_u(u0, u1, v, n, z, h, r, m, cap=None):
    for i in range(n):
        cu = u0 + (u1 - u0) * i / max(1, n - 1)
        cylinder(cu, v, r, z, h, m, segs=16)
        if cap is not None:
            box(cu - r * 1.4, v - r * 1.4, r * 2.8, r * 2.8, z + h - 0.8, 0.8, cap)
            box(cu - r * 1.4, v - r * 1.4, r * 2.8, r * 2.8, z, 0.6, cap)


def columns_v(v0, v1, u, n, z, h, r, m):
    for i in range(n):
        cylinder(u, v0 + (v1 - v0) * i / max(1, n - 1), r, z, h, m, segs=16)


def pediment(u, v, w, d, z, h, m):
    """Triangular gable over (u..u+w) facing +v, d deep."""
    roof(u, v, w, d, z, h, m, kind="gable", ridge="v", overhang=0.02)


def flat_roof(u, v, w, d, z, m=None):
    box(u + 0.04, v + 0.04, w - 0.08, d - 0.08, z, 0.3, m or mat("#5c5d5a", 0.95, grain=0.15, scale=10))


def star(cu, cv, z, r, h, m, along="v"):
    """Five-pointed star standing upright facing +v (h thick in tiles)."""
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((cu + math.cos(a) * rr, z + math.sin(a) * rr * 27))
    # Extrude in v: build as a prism in (u, z) by swapping — approximate with small boxes instead.
    import bmesh
    import kit

    bm = bmesh.new()
    front = [bm.verts.new((x, cv + h, zp(zz))) for x, zz in pts]
    back = [bm.verts.new((x, cv - h, zp(zz))) for x, zz in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit._obj("star", bm, m)


def minaret(cu, cv, z, h, r, body, cap, finial):
    lathe(cu, cv, z, [(r * 1.25, 0), (r * 1.25, 4), (r, 4.5), (r * 0.85, h * 0.78)], body, segs=24, cap_bottom=True)
    lathe(cu, cv, z + h * 0.78, [(r * 0.85, 0), (r * 1.45, 1.6), (r * 1.45, 2.6), (r * 0.8, 2.8)], body, segs=24)
    cylinder(cu, cv, r * 0.7, z + h * 0.78 + 2.6, h * 0.16, body, segs=24)
    dome(cu, cv, r * 0.85, z + h * 0.94, h * 0.12, cap, segs=24, onion=True)
    rod((cu, cv, zp(z + h * 1.06)), (cu, cv, zp(z + h * 1.06 + 4)), 0.01, finial)


# ---------------------------------------------------------------- the Allied Building

WING = {"usa": "#d8d2c2", "russia": "#86604e", "china": "#d9d2c0", "europe": "#b3b7ba", "islamic": "#cdb994"}
HEIGHT = {"usa": 70, "russia": 120, "china": 92, "europe": 92, "islamic": 96}
WING_H = 6


# Footprints of the seat of government on the wing roof (kept clear of rooftop clutter).
MAIN = {"usa": (0.38, 0.48, 3.24, 3.0), "russia": (0.38, 0.38, 3.24, 2.64), "europe": (0.48, 0.48, 3.04, 2.44)}


def plot(f):
    wing = mat(WING[f], 0.85, grain=0.12, scale=22)
    trim = mat("#e4dfd2" if f != "russia" else "#b5a28a", 0.8, grain=0.08)
    box(0, 0, 4, 4, 0, 2, mat("#8f8c84", 0.95, grain=0.18, scale=6))
    box(0.03, 0.03, 3.94, 3.94, 2, WING_H, wing)
    windows("left", 0.03, 0.03, 3.94, 3.94, 2, WING_H, 18, 1, glass(), trim, margin=0.04, fill=0.5)
    windows("right", 0.03, 0.03, 3.94, 3.94, 2, WING_H, 18, 1, glass(), trim, margin=0.04, fill=0.5)
    cornice(0.03, 0.03, 3.94, 3.94, 2 + WING_H - 0.6, 0.6, trim, 0.02)
    if f in MAIN:
        deck(f, 0.08, 0.08, 3.84, 3.84, 2 + WING_H, avoid=[MAIN[f]], team=TEAM[f])
    else:
        flat_roof(0.03, 0.03, 3.94, 3.94, 2 + WING_H)
    parapet(0.03, 0.03, 3.94, 3.94, 2 + WING_H, 1.5, trim, 0.05)
    door("left", 0.03, 0.03, 3.94, 3.94, 2, 0.46, 0.54, 4.5, frame=trim)


def usa(team):
    W = mat("#e2ddcf", 0.75, grain=0.08)
    trim = mat("#f2efe6", 0.7, grain=0.05)
    z0 = 8
    box(0.4, 0.5, 3.2, 2.3, z0, 2, mat("#b8b2a2", 0.85))
    box(0.5, 0.6, 3.0, 2.0, z0 + 2, 18, W)
    facade(0.5, 0.6, 3.0, 2.0, z0 + 2, 18, 12, 8, 3, trim)
    cornice(0.5, 0.6, 3.0, 2.0, z0 + 20, 1.5, trim)
    deck("usa", 0.55, 0.65, 2.9, 1.9, z0 + 21.5, avoid=[(1.3, 0.9, 1.4, 1.4)], team=team)
    parapet(0.48, 0.58, 3.04, 2.04, z0 + 21.5, 1.5, trim)
    # Portico: stylobate, eight columns, entablature with a team band and a pediment.
    box(1.15, 2.6, 1.7, 0.6, z0 + 2, 1, trim)
    steps(1.25, 3.2, 1.5, z0, 2, 0.12, 1, trim)
    columns_u(1.25, 2.75, 3.05, 6, z0 + 3, 15, 0.05, trim, trim)
    box(1.12, 2.6, 1.76, 0.58, z0 + 18, 2.5, trim)
    box(1.12, 3.18, 1.76, 0.01, z0 + 18.6, 1.2, mat(team, 0.5, grain=0))
    pediment(1.12, 2.6, 1.76, 0.58, z0 + 20.5, 6, trim)
    door("left", 0.5, 0.6, 3.0, 2.0, z0 + 2, 0.45, 0.55, 9, frame=trim)
    # Drum with pilasters and a low ribbed dome.
    cylinder(2.0, 1.6, 0.66, z0 + 21.5, 3, trim, segs=48)
    cylinder(2.0, 1.6, 0.6, z0 + 24.5, 5, W, segs=48)
    for k in range(16):
        a = 2 * math.pi * k / 16
        box(2.0 + math.cos(a) * 0.6 - 0.025, 1.6 + math.sin(a) * 0.6 - 0.025, 0.05, 0.05, z0 + 24.5, 5, trim)
    cylinder(2.0, 1.6, 0.64, z0 + 29.5, 1, trim, segs=48)
    dome(2.0, 1.6, 0.58, z0 + 30.5, 13, mat("#cfd2cc", 0.5, metal=0.3, grain=0.05), segs=48)
    cylinder(2.0, 1.6, 0.08, z0 + 43, 3, trim)
    rod((2.0, 1.6, zp(z0 + 46)), (2.0, 1.6, zp(z0 + 54)), 0.012, mat("#d8d8d8", 0.4, metal=0.8, grain=0))


def russia(team):
    STONE = mat("#86604e", 0.85, grain=0.1)
    LIGHT = mat("#c2ae94", 0.8, grain=0.08)
    z0 = 8
    box(0.4, 0.4, 3.2, 2.6, z0 - 6, 18, STONE)
    facade(0.4, 0.4, 3.2, 2.6, z0 - 6, 18, 14, 11, 3, LIGHT)
    cornice(0.4, 0.4, 3.2, 2.6, z0 + 12, 1.5, LIGHT)
    deck("russia", 0.45, 0.45, 3.1, 2.5, z0 + 13.5, avoid=[(1.08, 0.98, 1.84, 1.64)], team=team)
    parapet(0.4, 0.4, 3.2, 2.6, z0 + 13.5, 2, LIGHT)
    door("left", 0.4, 0.4, 3.2, 2.6, z0 - 6, 0.44, 0.56, 9, frame=LIGHT)
    # Stepped tower.
    box(1.1, 1.0, 1.8, 1.6, 20, 30, LIGHT)
    facade(1.1, 1.0, 1.8, 1.6, 20, 30, 7, 6, 6, mat("#e0d4bc", 0.8))
    for zz in (30, 40):
        box(1.08, 0.98, 1.84, 1.64, zz, 0.6, STONE)
    cornice(1.1, 1.0, 1.8, 1.6, 50, 1.2, STONE)
    box(1.4, 1.3, 1.2, 1.0, 51, 13, STONE)
    facade(1.4, 1.3, 1.2, 1.0, 51, 13, 4, 3, 2, LIGHT)
    box(1.38, 1.28, 1.24, 1.04, 62, 2, mat(team, 0.55, grain=0.05))
    roof(1.45, 1.35, 1.1, 0.9, 64, 18, STONE, kind="pyramid", overhang=0.0)
    gold = mat(GOLD, 0.35, metal=0.9, grain=0)
    rod((2.0, 1.8, zp(82)), (2.0, 1.8, zp(100)), 0.02, gold)
    star(2.0, 1.8, 104, 0.12, 0.02, mat(team, 0.4, emit=team))


def china(team):
    STONE = mat("#ddd5c2", 0.8, grain=0.08)
    COL = mat("#efe9da", 0.7, grain=0.05)
    GLAZE = mat("#3f7a54", 0.35, grain=0.05)
    RED = mat("#a52a1e", 0.7, grain=0.08)
    ROOF = mat("#d4a02c", 0.4, metal=0.2, grain=0.1)
    z0 = 8
    box(0.35, 0.45, 3.3, 2.6, z0, 2, mat("#c8c0ac", 0.85))
    box(0.5, 0.6, 3.0, 2.0, z0 + 2, 20, STONE)
    facade(0.5, 0.6, 3.0, 2.0, z0 + 2, 17, 12, 9, 3, COL)
    box(0.49, 0.59, 3.02, 2.02, z0 + 19, 2.2, GLAZE)
    cornice(0.5, 0.6, 3.0, 2.0, z0 + 21.2, 1, STONE)
    flat_roof(0.5, 0.6, 3.0, 2.0, z0 + 22.2)
    parapet(0.5, 0.6, 3.0, 2.0, z0 + 22.2, 2.2, STONE)
    # Colonnade with entablature and national emblem.
    box(0.75, 2.6, 2.5, 0.5, z0 + 2, 1, STONE)
    steps(0.95, 3.1, 2.1, z0, 2, 0.1, 1, STONE)
    columns_u(0.82, 3.18, 2.98, 10, z0 + 3, 16, 0.05, COL)
    box(0.68, 2.56, 2.64, 0.5, z0 + 19, 3, STONE)
    box(0.68, 3.06, 2.64, 0.01, z0 + 19.9, 1.2, mat(team, 0.5, grain=0))
    box(1.92, 3.07, 0.16, 0.02, z0 + 19.4, 3.6, mat("#f0c445", 0.4, metal=0.6, grain=0))
    box(1.94, 3.08, 0.12, 0.02, z0 + 19.9, 2.6, mat("#c8261d", 0.5, grain=0))
    # Two-tier pavilion.
    zz = z0 + 22.2
    box(1.4, 1.1, 1.2, 1.0, zz, 11, RED)
    columns_u(1.42, 2.58, 2.12, 5, zz, 11, 0.035, mat("#7a1d14", 0.6))
    roof(1.4, 1.1, 1.2, 1.0, zz + 11, 4, ROOF, overhang=0.18)
    box(1.6, 1.3, 0.8, 0.6, zz + 13, 8, RED)
    roof(1.6, 1.3, 0.8, 0.6, zz + 21, 7, ROOF, overhang=0.16)
    rod((2.0, 1.6, zp(zz + 27)), (2.0, 1.6, zp(zz + 31)), 0.02, mat("#f0c445", 0.3, metal=0.9, grain=0))


def europe(team):
    STEEL = mat("#b3b7ba", 0.6, metal=0.3, grain=0.05)
    G = mat("#4e6378", 0.08, metal=0.2, grain=0, glass=True)
    MULL = mat("#9aa0a6", 0.5, metal=0.6, grain=0)
    box(0.5, 0.5, 3.0, 2.4, 8, 6, STEEL)
    windows("left", 0.5, 0.5, 3.0, 2.4, 8, 6, 14, 1, glass(), None, margin=0.04, fill=0.7)
    box(0.8, 0.7, 2.4, 2.0, 14, 52, G)
    # Mullions and spandrel bands.
    for k in range(13):
        box(0.8 + k * 0.2 - 0.01, 2.7, 0.02, 0.012, 14, 52, MULL)
    for k in range(11):
        box(3.2, 0.7 + k * 0.2 - 0.01, 0.012, 0.02, 14, 52, MULL)
    for i in range(13):
        zz = 14 + i * 4.3
        box(0.79, 0.69, 2.42, 2.02, zz, 0.6, MULL)
    box(0.79, 0.69, 2.42, 2.02, 37, 3, mat(team, 0.4, grain=0))
    box(0.9, 0.8, 2.2, 1.8, 66, 4, STEEL)
    box(1.0, 0.85, 0.35, 0.3, 70, 4, mat("#a9adb2", 0.7))
    rod((2.9, 0.9, zp(70)), (2.9, 0.9, zp(84)), 0.012, MULL)
    gold = mat("#d8b23a", 0.3, metal=0.9, grain=0, emit="#806010")
    for i in range(12):
        a = (i / 12) * math.pi * 2
        star(2.0 + math.cos(a) * 0.6, 1.7 + math.sin(a) * 0.6, 71.2, 0.05, 0.01, gold)


def islamic(team):
    SAND = mat("#d8c19a", 0.85, grain=0.12)
    TILE = mat("#2a6b8a", 0.35, grain=0.05)
    TEAM_T = mat(team, 0.35, grain=0.05)
    GOLDM = mat(GOLD, 0.3, metal=0.9, grain=0)
    z = 8
    hu, hv = 0.5, 0.7
    box(hu, hv, 3, 2.1, z, 22, SAND)
    windows("left", hu, hv, 3, 2.1, z, 18, 7, 1, mat("#1e2c34", 0.3, grain=0), SAND, fill=0.45)
    windows("right", hu, hv, 3, 2.1, z, 18, 5, 1, mat("#1e2c34", 0.3, grain=0), SAND, fill=0.45)
    box(hu - 0.01, hv - 0.01, 3.02, 2.12, z + 18, 2.5, TEAM_T)
    cornice(hu, hv, 3, 2.1, z + 20.5, 1.5, SAND)
    flat_roof(hu, hv, 3, 2.1, z + 22)
    cu, cv = 2.0, 1.75
    cylinder(cu, cv, 0.72, z + 22, 6, SAND, segs=48)
    for k in range(16):
        a = 2 * math.pi * k / 16
        box(cu + math.cos(a) * 0.71 - 0.03, cv + math.sin(a) * 0.71 - 0.03, 0.06, 0.06, z + 23, 4, mat("#1e2c34", 0.3, grain=0))
    cylinder(cu, cv, 0.74, z + 28, 3, TILE, segs=48)
    lathe(cu, cv, z + 31, [(0.78, 0), (0.84, 6), (0.8, 13), (0.62, 21), (0.34, 27), (0.08, 30), (0.0005, 30.5)], TEAM_T, segs=48)
    rod((cu, cv, zp(z + 30.5)), (cu, cv, zp(z + 37)), 0.015, GOLDM)
    # Iwan portal.
    iu, iv, iw, idp, ih = 1.35, 2.75, 1.3, 0.4, 34
    box(iu, iv, iw, idp, z, ih, SAND)
    box(iu + 0.12 * iw, iv + idp, 0.76 * iw, 0.012, z, ih * 0.86, TILE)
    box(iu + 0.22 * iw, iv + idp - 0.25, 0.56 * iw, 0.27, z, ih * 0.72, mat("#3a2e22", 0.8, grain=0.05))
    box(iu + 0.22 * iw, iv + idp + 0.005, 0.56 * iw, 0.012, z + ih * 0.66, ih * 0.08, GOLDM)
    cornice(iu, iv, iw, idp, z + ih, 1.2, SAND, 0.02)
    door("left", iu + 0.4, iv - 0.25, 0.5, 0.27, z, 0.1, 0.9, 10, mat("#5a3a20", 0.6))
    minaret(1.0, 3.05, z, 52, 0.11, SAND, TEAM_T, GOLDM)
    minaret(3.0, 3.05, z, 52, 0.11, SAND, TEAM_T, GOLDM)


STYLES = {"usa": usa, "russia": russia, "china": china, "europe": europe, "islamic": islamic}


def allied(f):
    plot(f)
    STYLES[f](TEAM[f])
    render(f"allied-{f}", (4, 4), HEIGHT[f] + 8)


MODELS = {f"allied-{f}": (lambda f=f: allied(f)) for f in TEAM}

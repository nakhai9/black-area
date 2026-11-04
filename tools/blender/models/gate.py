"""Nation Gate (4 × 1, a flat piece: heights not scaled): two end towers in each nation's architecture, the two middle
cells open as the way through under a high arch / beam. The wall slabs it joins are 34 px tall, 2/3 cell thick (Wall.ts)."""
import math

import bmesh

import kit
from kit import box, cylinder, dome, lathe, mat, render, rod, roof, zp, TEAM

MAX_H = 90


def arch_wall(u0, u1, v0, v1, z0, top, spring, apex, material, pointed=0.0, segs=20):
    """Slab across u0..u1 (thick v0..v1) from z0 to top with an arched opening from the slab's bottom: the opening spans
    the slab's width (minus nothing — piers are separate), springs at `spring` and crowns at `apex` (art px).
    pointed > 0 makes a pointed (Islamic) arch."""
    cu, hw = (u0 + u1) / 2, (u1 - u0) / 2
    curve = []
    for i in range(segs + 1):
        t = i / segs  # 0 → right end, 1 → left end
        if pointed:
            x = 1 - 2 * t
            s = (1 - abs(x)) ** (1 - pointed)
        else:
            a = math.pi * t
            x, s = math.cos(a), math.sin(a)
        curve.append((cu + hw * x, spring + (apex - spring) * s))
    # One convex block per arch segment, from the curve up to the top (robust normals, no concave n-gons).
    bm = bmesh.new()
    for (ua, za), (ub, zb) in zip(curve, curve[1:]):
        lo, hi = (ub, ua) if ub < ua else (ua, ub)
        zl, zh = (zb, za) if ub < ua else (za, zb)
        quad = [(lo, zl), (hi, zh), (hi, top), (lo, top)]
        f = [bm.verts.new((u, v1, zp(z))) for u, z in quad]
        k = [bm.verts.new((u, v0, zp(z))) for u, z in quad]
        bm.faces.new(f)
        bm.faces.new(list(reversed(k)))
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((f[j], f[i], k[i], k[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit._obj("arch", bm, material)


def courses(u, v, w, d, z, h, color, step=4.0, face_mats=None):
    """Thin mortar / ashlar course lines proud of the +v and +u faces of a block."""
    m = mat(color, 0.95, grain=0.05)
    zz = z + step
    while zz < z + h - 0.5:
        box(u - 0.004, v + d, w + 0.008, 0.006, zz, 0.35, m)
        box(u + w, v - 0.004, 0.006, d + 0.008, zz, 0.35, m)
        zz += step


def battlements(u0, u1, v0, v1, z, h, n, material, swallow=False):
    w = (u1 - u0) / (2 * n - 1)
    for i in range(n):
        u = u0 + i * 2 * w
        if swallow:
            box(u, v0, w * 0.42, v1 - v0, z, h, material)
            box(u + w * 0.58, v0, w * 0.42, v1 - v0, z, h, material)
            box(u, v0, w, v1 - v0, z, h * 0.55, material)
        else:
            box(u, v0, w, v1 - v0, z, h, material)


# ---------------------------------------------------------------- nations


def usa():
    team = TEAM["usa"]
    marble = mat("#eeeae0", 0.55, grain=0.12, scale=14)
    marble2 = mat("#dcd7ca", 0.65, grain=0.15, scale=14)
    granite = mat("#9c9a94", 0.8, grain=0.25, scale=30)
    bronze = mat("#7a5a2c", 0.35, metal=0.85, grain=0.05)
    gold = mat("#d9b44a", 0.3, metal=0.9, grain=0.02)
    navy = mat("#22336b", 0.5, grain=0.03)
    glow = mat("#ffe08a", 0.4, emit="#ffd070", grain=0)
    PY = 46
    vf = 0.9
    for u in (0, 3):
        box(u + 0.03, 0.06, 0.94, 0.88, 0, 3, granite, bevel=0.01)
        box(u + 0.1, 0.1, 0.8, 0.68, 3, PY - 3, marble2, bevel=0.006)
        courses(u + 0.1, 0.1, 0.8, 0.68, 3, PY - 9, "#c8c2b2", 5)
        box(u + 0.08, 0.08, 0.84, 0.74, PY - 6, 2, marble, bevel=0.005)
        for cu in (0.24, 0.76):
            box(u + cu - 0.12, vf - 0.13, 0.24, 0.22, 3, 2, marble, bevel=0.005)
            lathe(u + cu, vf - 0.02, 5, [(0.095, 0), (0.085, PY - 12)], marble, segs=20, cap_top=True)
            for k in range(8):  # fluting shadows
                a = math.pi * (0.1 + k / 8)
                rod((u + cu + 0.092 * math.cos(a), vf - 0.02 + 0.092 * math.sin(a), zp(6)), (u + cu + 0.083 * math.cos(a), vf - 0.02 + 0.083 * math.sin(a), zp(PY - 8)), 0.006, marble2, 4)
            box(u + cu - 0.13, vf - 0.14, 0.26, 0.24, PY - 7, 2, marble, bevel=0.01)
            for s in (-0.1, 0.1):
                cylinder(u + cu + s, vf + 0.1, 0.035, PY - 7, 2, marble2, 10)
        lu = u + (0.1 if u == 0 else 0.9)
        box(lu - 0.05, vf - 0.05, 0.1, 0.1, PY - 18, 4, bronze)
        box(lu - 0.035, vf - 0.035, 0.07, 0.07, PY - 17, 2.4, glow)
        roof(lu - 0.06, vf - 0.06, 0.12, 0.12, PY - 14, 2, bronze, kind="pyramid", overhang=0)
    # Guard booth door with lit window and team-blue awning; bronze plaque on the right pylon.
    box(0.38, 0.78, 0.24, 0.03, 3, 12, navy)
    box(0.42, 0.8, 0.16, 0.02, 10, 4, mat("#bfe0ff", 0.2, emit="#9fc8ff", grain=0))
    box(0.34, 0.78, 0.32, 0.08, 15, 1.5, mat(team, 0.5, grain=0))
    box(3.38, 0.78, 0.24, 0.03, 6, 8, marble2)
    box(3.42, 0.8, 0.16, 0.02, 8, 4, gold)
    # Entablature over the passage.
    z = PY - 4
    box(0.04, 0.12, 3.92, vf - 0.06, z, 3, marble2, bevel=0.005)
    box(0.03, 0.1, 3.94, vf - 0.02, z + 3, 5, marble, bevel=0.005)
    box(0.7, vf + 0.08, 2.6, 0.012, z + 4, 3, navy)
    for i in range(13):
        if i != 6:
            box(0.85 + (i + 0.5) / 13 * 2.3 - 0.03, vf + 0.093, 0.06, 0.006, z + 4.6, 1.8, gold)
    box(0, 0.08, 4, vf + 0.04, z + 8, 2, marble, bevel=0.006)
    for i in range(16):
        box(0.1 + i * 0.24, vf + 0.1, 0.1, 0.02, z + 7.4, 0.7, marble2)
    za = z + 10
    box(0.9, 0.2, 2.2, 0.6, za, 4, marble, bevel=0.006)
    box(1.0, 0.8, 2.0, 0.01, za + 0.8, 2.4, marble2)
    box(1.4, 0.3, 1.2, 0.4, za + 4, 3, marble, bevel=0.006)
    box(1.45, 0.7, 1.1, 0.012, za + 4.6, 1.6, mat(team, 0.5, grain=0))


def russia():
    team = TEAM["russia"]
    brick = mat("#a8392b", 0.85, grain=0.28, scale=60)
    trim = mat("#ece4d4", 0.7, grain=0.08)
    green = mat("#2f6b4a", 0.45, metal=0.3, grain=0.08)
    gold = mat("#c9a542", 0.3, metal=0.9, grain=0.02)
    ruby = mat(team, 0.2, emit=team, grain=0)
    dark = mat("#3a1612", 0.9, grain=0)
    H = 34
    for u in (0, 3):
        box(u + 0.1, 0.1, 0.8, 0.8, 0, H, brick)
        courses(u + 0.1, 0.1, 0.8, 0.8, 0, H, "#7a2a20", 3)
        box(u + 0.08, 0.08, 0.84, 0.84, 0, 2.5, trim)
        box(u + 0.08, 0.08, 0.84, 0.84, H - 1, 2, trim, bevel=0.005)
        for f in ((u + 0.38, 0.9, 0.24, 0.02), (u + 0.9, 0.38, 0.02, 0.24)):
            box(f[0], f[1], f[2], f[3], 14, 9, dark)
        box(u + 0.36, 0.9, 0.28, 0.025, 23, 1.2, trim)
        battlements(u + 0.1, u + 0.9, 0.1, 0.15, H + 1, 4, 4, brick, swallow=True)
        battlements(u + 0.1, u + 0.9, 0.85, 0.9, H + 1, 4, 4, brick, swallow=True)
        box(u + 0.2, 0.2, 0.6, 0.6, H + 1, 9, brick)
        box(u + 0.3, 0.8, 0.4, 0.01, H + 2.5, 6, trim)
        cylinder(u + 0.5, 0.815, 0.13, H + 3, 0.1, mat("#f2ece0", 0.6, grain=0), 24)
        for cu, cv in ((0.22, 0.22), (0.78, 0.22), (0.22, 0.78), (0.78, 0.78)):
            roof(u + cu - 0.05, cv - 0.05, 0.1, 0.1, H + 10, 5, gold, kind="pyramid", overhang=0)
        cylinder(u + 0.5, 0.5, 0.22, H + 10, 6, trim, 8)
        for k in range(8):
            a = 2 * math.pi * (k + 0.5) / 8
            box(u + 0.5 + 0.2 * math.cos(a) - 0.02, 0.5 + 0.2 * math.sin(a) - 0.02, 0.04, 0.04, H + 11.5, 3, dark)
        roof(u + 0.3, 0.3, 0.4, 0.4, H + 16, 14, green, kind="pyramid", overhang=0.02)
        rod((u + 0.5, 0.5, zp(H + 30)), (u + 0.5, 0.5, zp(H + 33)), 0.012, gold)
        # Ruby star: two crossed flat stars.
        for rot in (0, 1):
            pts = []
            for i in range(10):
                a = math.pi / 2 + i * math.pi / 5
                r = 0.09 if i % 2 == 0 else 0.04
                pts.append((r * math.cos(a), r * math.sin(a) * 6.5))  # (horizontal tiles, px)
            bm = bmesh.new()
            vs = []
            for h, zz in pts:
                uu, vv = (u + 0.5 + h * 0.7, 0.5 - h * 0.7) if rot == 0 else (u + 0.5 + h * 0.7, 0.5 + h * 0.7)
                vs.append(bm.verts.new((uu, vv, zp(H + 37 + zz))))
            bm.faces.new(vs)
            ob = kit._obj("star", bm, ruby)
            ob.modifiers.new("s", "SOLIDIFY").thickness = 0.02
    # Arched span wall over the passage, white cornice and swallow-tail merlons.
    arch_wall(0.9, 3.1, 0.3, 0.7, 0, H, 16, 26, brick, segs=24)
    box(0.9, 0.28, 2.2, 0.44, H - 1, 1.5, trim)
    box(0.9, 0.7, 2.2, 0.012, 26.5, 1.2, trim)
    battlements(0.95, 3.05, 0.44, 0.56, H + 0.5, 5, 9, brick, swallow=True)


def china():
    red = mat("#b52a22", 0.45, grain=0.08)
    gold = mat("#e0ac2c", 0.35, metal=0.4, grain=0.1, scale=40)
    marble = mat("#c8c2b4", 0.7, grain=0.15)
    green = mat("#2f7a5a", 0.5, grain=0.05)
    blue = mat("#2d4f9a", 0.5, grain=0.05)
    H = 42
    for u in (0, 3):
        box(u + 0.1, 0.16, 0.8, 0.68, 0, 3, marble, bevel=0.01)
        box(u + 0.16, 0.24, 0.68, 0.52, 3, 18, red)  # low red wall stub (joins the walls)
        box(u + 0.14, 0.22, 0.72, 0.56, 21, 1.2, marble)
        for cu in (0.3, 0.7):
            for cv in (0.3, 0.7):
                cylinder(u + cu, cv, 0.075, 3, H - 6, red, 16)
                cylinder(u + cu, cv, 0.1, 3, 2, marble, 16)
        box(u + 0.2, 0.25, 0.6, 0.5, H - 6, 2, green)
        roof(u + 0.2, 0.3, 0.6, 0.4, H - 4, 8, gold, kind="hip", overhang=0.12)
    box(0.15, 0.3, 3.7, 0.4, H - 4, 4, green)
    for i in range(12):
        box(0.2 + i * 0.3, 0.7, 0.12, 0.012, H - 3, 2, blue)
    box(0.15, 0.3, 3.7, 0.4, H, 3, red)
    box(1.7, 0.7, 0.6, 0.02, H - 2, 5, blue)
    box(1.78, 0.715, 0.44, 0.012, H - 1, 3, gold)
    roof(0.2, 0.3, 3.6, 0.4, H + 3, 11, gold, kind="hip", overhang=0.16)
    for u, du in ((0.04, -1), (3.96, 1)):  # upturned eave tips
        for v in (0.14, 0.86):
            rod((u, v, zp(H + 3)), (u + du * 0.05, v + (v - 0.5) * 0.1, zp(H + 6)), 0.018, gold)
    box(1.1, 0.38, 1.8, 0.24, H + 10, 4, red)
    roof(1.1, 0.38, 1.8, 0.24, H + 14, 9, gold, kind="hip", overhang=0.14)
    for u in (1.05, 2.95):
        cylinder(u, 0.5, 0.03, H + 22, 3, mat("#a8781e", 0.4, metal=0.6))
    dome(2, 0.5, 0.05, H + 23, 3, mat("#e8c45a", 0.3, metal=0.8))


def europe():
    team = TEAM["europe"]
    stone = mat("#d8c39a", 0.75, grain=0.18, scale=22)
    stone2 = mat("#c4ae86", 0.8, grain=0.2, scale=22)
    bronze = mat("#4f6b52", 0.4, metal=0.7, grain=0.15)
    eu = mat("#1f3f99", 0.5, grain=0)
    star = mat("#f4cf3a", 0.3, metal=0.5, emit="#f4cf3a", grain=0)
    H = 42
    for u in (0, 3):
        box(u + 0.09, 0.09, 0.82, 0.82, 0, 3, stone2, bevel=0.01)
        box(u + 0.17, 0.17, 0.66, 0.4, 3, H - 3, stone2)
        courses(u + 0.17, 0.17, 0.66, 0.4, 3, H - 3, "#a8946e", 4)
        for cu in (0.26, 0.74):
            box(u + cu - 0.12, 0.6, 0.24, 0.24, 3, 2, stone, bevel=0.005)
            lathe(u + cu, 0.72, 5, [(0.105, 0), (0.095, H - 9)], stone, segs=20, cap_top=True)
            box(u + cu - 0.12, 0.6, 0.24, 0.24, H - 4, 1, stone, bevel=0.005)
    box(0.06, 0.12, 3.88, 0.78, H - 3, 3, stone)
    box(0.04, 0.1, 3.92, 0.82, H, 3, stone)
    for i in range(13):
        box(0.15 + i * 0.29, 0.92, 0.07, 0.01, H + 0.5, 2, stone2)
    box(0.2, 0.16, 3.6, 0.68, H + 3, 6, stone, bevel=0.005)
    box(1.0, 0.3, 2.0, 0.4, H + 9, 3, stone, bevel=0.005)
    for u in (0, 3):
        box(u + 0.3, 0.35, 0.4, 0.3, H + 9, 3, stone2)
    box(1.2, 0.84, 1.6, 0.01, H + 4, 4.5, eu)
    for i in range(12):
        a = 2 * math.pi * i / 12
        box(2 + 0.22 * math.cos(a) - 0.015, 0.852, 0.03, 0.005, H + 6.25 + 1.7 * math.sin(a) - 0.4, 0.8, star)
    box(1.25, 0.84, 0.08, 0.012, H + 4, 4.5, mat(team, 0.5, grain=0))
    box(2.67, 0.84, 0.08, 0.012, H + 4, 4.5, mat(team, 0.5, grain=0))


def islamic():
    team = TEAM["islamic"]
    sand = mat("#dcc59c", 0.8, grain=0.2, scale=24)
    sand2 = mat("#c6ae84", 0.85, grain=0.2, scale=24)
    cream = mat("#efe2c2", 0.6, grain=0.08)
    tile = mat("#1f9d4a", 0.3, grain=0.15, scale=60)
    tile_d = mat("#136b33", 0.35, grain=0.1, scale=60)
    tile_l = mat("#5cc47e", 0.3, grain=0.1, scale=60)
    lapis = mat("#1e4f8a", 0.3, grain=0.15, scale=60)
    gold = mat("#d4b24a", 0.3, metal=0.9, grain=0.02)
    dome_m = mat("#2fae5e", 0.25, metal=0.1, grain=0.08)
    TH = 46
    for u in (0, 3):
        box(u + 0.06, 0.06, 0.88, 0.88, 0, 3, sand2, bevel=0.01)
        box(u + 0.1, 0.1, 0.8, 0.8, 3, TH - 3, sand)
        courses(u + 0.1, 0.1, 0.8, 0.8, 3, TH - 3, "#b39a70", 3)
        for bz, bh, m in ((11, 2, tile), (28, 2, tile_d), (TH - 6, 4, tile)):
            box(u + 0.08, 0.08, 0.84, 0.84, bz, bh, m)
        for i in range(6):
            box(u + 0.13 + i * 0.13, 0.925, 0.06, 0.008, TH - 4.8, 1.6, tile_l)
        # Blind pointed niches on both visible faces.
        arch_wall(u + 0.26, u + 0.74, 0.9, 0.915, 14, 33, 24, 31, tile_d, pointed=0.6, segs=12)
        box(u + 0.3, 0.895, 0.4, 0.006, 14, 13, lapis)
        arch_wall(u + 0.26, u + 0.74, 0.0, 0.015, 14, 33, 24, 31, tile_d, pointed=0.6, segs=12)  # back (shadowed)
    # Pishtaq with a pointed iwan arch over the passage.
    z0, apex, top = 26, 52, 60
    arch_wall(0.9, 3.1, 0.2, 0.9, 0, top, z0, apex, sand, pointed=0.6, segs=28)
    arch_wall(0.9, 3.1, 0.9, 0.92, 0, top, z0, apex, tile, pointed=0.6, segs=28)
    arch_wall(1.0, 3.0, 0.905, 0.925, 0, top - 6, z0, apex - 1, sand, pointed=0.6, segs=28)
    # Muqarnas half-vault: stepped tiers of cells inside the arch head.
    for r in range(4):
        zb = 37 + r * 3.4
        hw = 0.95 * (1 - ((zb + 3.4 - z0) / (apex - z0)) ** 1.6)
        n = max(1, 6 - r)
        w = 2 * hw / n
        for k in range(n):
            a = 2 - hw + k * w
            box(a + 0.01, 0.55 - r * 0.06, w - 0.02, 0.3, zb, 3.2, cream if (k + r) % 2 else tile_l)
    box(0.95, 0.25, 2.1, 0.55, apex - 1, top - apex + 1, sand2)  # vault back fill
    box(0.9, 0.2, 2.2, 0.72, top - 0.4, 0.5, sand)  # roof slab
    box(1.0, 0.926, 2.0, 0.008, top - 5, 3, gold)
    for i in range(18):
        t = (i + 0.5) / 18
        tall = i % 3 == 0
        box(1.07 + t * 1.86 - 0.008, 0.935, 0.016, 0.004, top - 4.6, 2.4 if tall else 1.2, tile_d)
    for su in (1.13, 2.87):
        cylinder(su, 0.93, 0.07, apex - 2, 0.1, lapis, 16)
        cylinder(su, 0.935, 0.035, apex - 1.5, 0.1, gold, 12)
    for i in range(9):
        box(0.96 + i * 0.24, 0.45, 0.12, 0.1, top, 2.5, tile if i % 2 else tile_d)
    box(1.0, 0.928, 2.0, 0.006, top - 1.5, 1.2, mat(team, 0.5, grain=0))
    # Minarets.
    for u in (0, 3):
        cu = u + 0.5
        cylinder(cu, 0.5, 0.26, TH, 3, sand, 8)
        cylinder(cu, 0.5, 0.17, TH + 3, 13, cream, 12)
        for k in range(3):
            cylinder(cu, 0.5, 0.175, TH + 5 + k * 3.5, 0.8, lapis, 12)
        cylinder(cu, 0.5, 0.27, TH + 15, 1.5, tile_d, 16)
        for k in range(12):  # balcony railing posts
            a = 2 * math.pi * k / 12
            rod((cu + 0.25 * math.cos(a), 0.5 + 0.25 * math.sin(a), zp(TH + 16.5)), (cu + 0.25 * math.cos(a), 0.5 + 0.25 * math.sin(a), zp(TH + 18)), 0.008, sand2, 4)
        cylinder(cu, 0.5, 0.15, TH + 16.5, 7, tile, 12)
        cylinder(cu, 0.5, 0.23, TH + 23.5, 1.2, tile_d, 16)
        dome(cu, 0.5, 0.17, TH + 24.7, 9, dome_m, onion=True)
        rod((cu, 0.5, zp(TH + 33)), (cu, 0.5, zp(TH + 37)), 0.012, gold)
        lathe(cu, 0.5, TH + 37, [(0.0, 0), (0.04, 1), (0.0, 2)], gold, segs=12)


STYLES = {"usa": usa, "russia": russia, "china": china, "europe": europe, "islamic": islamic}


STUB = 0.2  # how far the wall stub runs in from each end (cells); the towers start at 0.1 and cover the rest


def wall_stubs(faction):
    """The nation's own wall piece (models/wall.py, a straight W-E block, sound) at both ends of the gate, cut to STUB
    cells, so a wall built against either end joins the gate as one seamless line."""
    import random

    import bpy

    from models import wall as wl

    wl._wm.clear()
    for u0 in (0, 3):
        before = set(bpy.data.objects)
        rng = random.Random(7)
        if faction == "china":
            wl.great_wall(wl.E | wl.W, 0, rng)
        else:
            wl.nation_wall(faction, wl.E | wl.W, 0, rng)
        lo, hi = (0.0, STUB) if u0 == 0 else (1 - STUB, 1.0)
        for ob in set(bpy.data.objects) - before:
            us = [vt.co.y for vt in ob.data.vertices]  # Blender y = u
            if min(us) >= hi - 1e-6 or max(us) <= lo + 1e-6:
                bpy.data.objects.remove(ob)
                continue
            for vt in ob.data.vertices:
                vt.co.y = min(max(vt.co.y, lo), hi) + u0


def gate(faction):
    kit.ZS = 1.0
    try:
        wall_stubs(faction)
        STYLES[faction]()
        render(f"gate-{faction}", (4, 1), MAX_H)
    finally:
        kit.ZS = 1.35


MODELS = {f"gate-{f}": (lambda f=f: gate(f)) for f in TEAM}

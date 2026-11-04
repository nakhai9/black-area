"""High-Tech Center (4 x 4): each nation's own skyscraper (same layouts as the old vector art in TechCenter.ts)."""
import math

import bmesh

from kit import _obj, box, cylinder, dome, lathe, mat, prism, render, roof, rod, zp, TEAM


def glassm(hexs="#2c3a4e"):
    return mat(hexs, 0.08, metal=0.3, grain=0.04, scale=4, glass=True)


def panes(u, v, w, d, z, h, cols_per_tile, rows, glass, frame, fill=0.6, vfill=0.6, depth=0.012):
    """Window grid on all four faces of the box, with sills on the visible faces."""
    for face in ("+v", "-v", "+u", "-u"):
        length = w if face in ("+v", "-v") else d
        cols = max(1, round(length * cols_per_tile))
        for c in range(cols):
            s0 = (c + (1 - fill) / 2) / cols * length
            sw = fill / cols * length
            for r in range(rows):
                t0 = z + h * (r + (1 - vfill) / 2) / rows
                th = h * vfill / rows
                if face == "+v":
                    box(u + s0, v + d, sw, depth, t0, th, glass)
                    box(u + s0 - 0.01, v + d, sw + 0.02, depth * 2, t0 - 0.5, 0.5, frame)
                elif face == "-v":
                    box(u + s0, v - depth, sw, depth, t0, th, glass)
                elif face == "+u":
                    box(u + w, v + s0, depth, sw, t0, th, glass)
                    box(u + w, v + s0 - 0.01, depth * 2, sw + 0.02, t0 - 0.5, 0.5, frame)
                else:
                    box(u - depth, v + s0, depth, sw, t0, th, glass)


def curtain(u, v, w, d, z, h, glass, frame, floors, mull=6):
    """Glass curtain-wall block: glass box, floor slabs and mullions on all faces."""
    box(u, v, w, d, z, h, glass)
    for i in range(floors + 1):
        box(u - 0.01, v - 0.01, w + 0.02, d + 0.02, z + h * i / floors - 0.4, 0.8, frame)
    for face in range(4):
        length = w if face < 2 else d
        n = max(2, round(length * mull))
        for k in range(n + 1):
            s = length * k / n
            if face == 0:
                box(u + s - 0.008, v + d, 0.016, 0.012, z, h, frame)
            elif face == 1:
                box(u + s - 0.008, v - 0.012, 0.016, 0.012, z, h, frame)
            elif face == 2:
                box(u + w, v + s - 0.008, 0.012, 0.016, z, h, frame)
            else:
                box(u - 0.012, v + s - 0.008, 0.012, 0.016, z, h, frame)


def stone_block(u, v, w, d, z, h, stone, glass, frame, floors, cols=5, cornice=None):
    box(u, v, w, d, z, h, stone)
    panes(u, v, w, d, z, h, cols, floors, glass, frame, fill=0.45, vfill=0.62)
    box(u - 0.04, v - 0.04, w + 0.08, d + 0.08, z + h - 1.2, 1.4, cornice or stone)


def roof_kit(u, v, w, d, z):
    """Rooftop clutter: AC units and a vent."""
    ac = mat("#9a9c9e", 0.5, metal=0.5, grain=0.03)
    box(u + w * 0.15, v + d * 0.2, 0.18, 0.14, z, 2.2, ac)
    box(u + w * 0.15, v + d * 0.55, 0.18, 0.14, z, 2.2, ac)
    cylinder(u + w * 0.75, v + d * 0.3, 0.05, z, 3, ac, 12)


def podium(stone, glass, team, h=20, arched=False):
    base = mat("#7a7c7e", 0.9, grain=0.15, scale=8)
    st = mat(stone, 0.85, grain=0.12, scale=14)
    dark = mat("#4a4c4e", 0.9, grain=0.05)
    frame = mat("#5a5a58", 0.5, metal=0.6, grain=0)
    g = glassm(glass)
    box(0, 0, 4, 4, 0, 2, base)
    box(0.05, 0.05, 3.9, 3.9, 2, h, st)
    if arched:
        # Arcade of pointed arches on every side.
        for k in range(9):
            s = 0.25 + k * 0.4
            box(s, 3.95, 0.24, 0.015, 4, h * 0.5, g)
            roof(s, 3.945, 0.24, 0.02, 4 + h * 0.5, 4, g, kind="gable", ridge="v", overhang=0)
            box(3.95, s, 0.015, 0.24, 4, h * 0.5, g)
            roof(3.945, s, 0.02, 0.24, 4 + h * 0.5, 4, g, kind="gable", ridge="u", overhang=0)
            box(s, 0.035, 0.24, 0.015, 4, h * 0.5, g)
            box(0.035, s, 0.015, 0.24, 4, h * 0.5, g)
    else:
        panes(0.05, 0.05, 3.9, 3.9, 2, h, 5, 3, g, frame, fill=0.62, vfill=0.6)
    box(0.04, 0.04, 3.92, 3.92, 2 + h * 0.86, h * 0.08, mat(team, 0.5, grain=0.03))
    box(0.0, 0.0, 4.0, 4.0, 2 + h, 1.2, mat(stone, 0.8, grain=0.08))
    box(0.1, 0.1, 3.8, 3.8, 2 + h + 0.2, 1.2, mat("#56595c", 0.95, grain=0.1, scale=30))
    # Entrance on the +v (left) face: glass doors, team canopy on posts, steps.
    box(1.4, 3.92, 1.2, 0.05, 2, h * 0.5, mat("#9fc3d8", 0.05, metal=0.2, grain=0, glass=True))
    for k in range(5):
        box(1.4 + k * 0.29, 3.93, 0.02, 0.06, 2, h * 0.5, frame)
    box(1.35, 3.75, 1.3, 0.38, 2 + h * 0.55, 1.5, mat(team, 0.5, grain=0.03))
    for pu in (1.4, 2.6):
        rod((pu, 4.1, zp(2)), (pu, 4.1, zp(2 + h * 0.55)), 0.012, frame)
    box(1.3, 3.95, 1.4, 0.12, 0, 1.2, mat("#b8b6b0", 0.9))
    box(1.3, 4.0, 1.4, 0.05, 0, 0.6, dark)


def antenna(cu, cv, z, h, r=0.03, col="#c8c8c8"):
    m = mat(col, 0.35, metal=0.9, grain=0)
    rod((cu, cv, zp(z)), (cu, cv, zp(z + h)), r, m, 10)
    lathe(cu, cv, z + h - 1, [(0.0, 0), (0.035, 1), (0.0, 2.5)], mat("#ff3b30", 0.4, grain=0, emit="#ff3b30"), 12)


def usa(f):
    team = TEAM[f]
    stone, glass = "#c8c0a8", "#2c3a4e"
    podium(stone, glass, team)
    g = glassm(glass)
    fr = mat("#6a6458", 0.6, metal=0.4, grain=0)
    stones = [mat(c, 0.85, grain=0.12, scale=14) for c in ("#c8c0a8", "#d0c9b2", "#d8d2bc")]

    def deco(u, v, w, d, z, h, floors, k):
        stone_block(u, v, w, d, z, h, stones[k], g, fr, floors, cols=6, cornice=mat("#b8b098", 0.8))
        n = round(w * 6)
        for i in range(n + 1):
            box(u + w * i / n - 0.025, v + d, 0.05, 0.03, z, h - 1, stones[k])
        n = round(d * 6)
        for i in range(n + 1):
            box(u + w, v + d * i / n - 0.025, 0.03, 0.05, z, h - 1, stones[k])

    deco(1.0, 0.9, 2.0, 1.8, 22, 70, 12, 0)
    tb = mat(team, 0.5, grain=0.03)
    box(1.0, 2.7, 2.0, 0.035, 88, 2.5, tb)
    box(3.0, 0.9, 0.035, 1.8, 88, 2.5, tb)
    deco(1.2, 1.1, 1.6, 1.4, 92, 36, 6, 1)
    deco(1.45, 1.35, 1.1, 0.9, 128, 22, 4, 2)
    roof_kit(1.0, 0.9, 0.3, 1.8, 92)
    box(1.7, 1.55, 0.6, 0.5, 150, 12, stones[2])
    panes(1.7, 1.55, 0.6, 0.5, 150, 12, 6, 2, g, fr, fill=0.4)
    lathe(2.0, 1.8, 162, [(0.2, 0), (0.18, 6), (0.12, 10), (0.08, 12)], mat("#d8d4c8", 0.6, grain=0.05), 32, cap_top=True)
    antenna(2.0, 1.8, 172, 28, 0.035)
    render(f"techcenter-{f}", (4, 4), 210)


def russia(f):
    team = TEAM[f]
    stone, glass = "#d2c4a0", "#3a4048"
    podium(stone, glass, team, 14)
    g = glassm(glass)
    fr = mat("#7a6a50", 0.7, grain=0)
    st = mat(stone, 0.85, grain=0.12, scale=14)
    st2 = mat("#ddd0ae", 0.85, grain=0.12, scale=14)
    red = mat("#a8322a", 0.7, grain=0.08)
    gold = mat("#c8a850", 0.3, metal=0.9, grain=0.03)
    for u, v in [(0.3, 0.3), (2.7, 0.3), (0.3, 2.7), (2.7, 2.7)]:
        stone_block(u, v, 1.0, 1.0, 16, 30, st, g, fr, 5, cols=5, cornice=red)
        roof(u + 0.15, v + 0.15, 0.7, 0.7, 46, 12, gold, kind="pyramid", overhang=0)
    stone_block(1.05, 0.95, 1.9, 1.8, 16, 18, st, g, fr, 3, cornice=red)
    stone_block(1.3, 1.2, 1.4, 1.3, 34, 56, st2, g, fr, 9, cornice=red)
    tb = mat(team, 0.5, grain=0.03)
    box(1.3, 2.5, 1.4, 0.03, 86, 2.5, tb)
    box(2.7, 1.2, 0.03, 1.3, 86, 2.5, tb)
    for u, v in [(1.3, 1.2), (2.7, 1.2), (1.3, 2.5), (2.7, 2.5)]:
        lathe(u, v, 90, [(0.06, 0), (0.0, 8)], gold, 8)
    stone_block(1.5, 1.4, 1.0, 0.9, 90, 26, st2, g, fr, 4, cornice=red)
    stone_block(1.7, 1.6, 0.6, 0.5, 116, 14, st2, g, fr, 2)
    lathe(2.0, 1.85, 130, [(0.3, 0), (0.22, 12), (0.12, 30), (0.04, 46), (0.015, 52)], gold, 8)
    lathe(2.0, 1.85, 182, [(0.02, 0), (0.02, 8)], gold, 8)
    # Red star standing in the u-z plane (faces the +v side), centred at z = 196.
    cz = zp(196)
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        r = 0.2 if k % 2 == 0 else 0.08
        pts.append((r * math.cos(a), r * math.sin(a)))
    bm = bmesh.new()
    front = [bm.verts.new((2.0 + x, 1.87, cz + y)) for x, y in pts]
    back = [bm.verts.new((2.0 + x, 1.83, cz + y)) for x, y in pts]
    centre_f = bm.verts.new((2.0, 1.87, cz))
    centre_b = bm.verts.new((2.0, 1.83, cz))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((centre_f, front[i], front[j]))
        bm.faces.new((centre_b, back[j], back[i]))
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("star", bm, mat("#e0201a", 0.3, grain=0, emit="#c01010"))
    render(f"techcenter-{f}", (4, 4), 210)


def china(f):
    team = TEAM[f]
    stone, glass = "#9a948a", "#24485a"
    podium(stone, glass, team)
    g = glassm(glass)
    fr = mat("#c8b894", 0.5, metal=0.5, grain=0)
    eave = mat("#8a2a1e", 0.7, grain=0.08)
    gold = mat("#c8a850", 0.3, metal=0.9, grain=0.03)
    tiers = [(1.15, 1.05, 1.7, 1.6, 22, 30), (1.25, 1.15, 1.5, 1.4, 58, 26), (1.35, 1.25, 1.3, 1.2, 90, 22),
             (1.45, 1.35, 1.1, 1.0, 118, 18), (1.55, 1.45, 0.9, 0.8, 142, 14)]
    for i, (u, v, w, d, z, h) in enumerate(tiers):
        curtain(u, v, w, d, z, h, g, fr, 4 if i < 3 else 3)
        box(u - 0.14, v - 0.14, w + 0.28, d + 0.28, z + h, 1.0, eave)
        roof(u, v, w, d, z + h + 1, 5, eave, kind="hip", overhang=0.12)
        for cu, cv in [(u - 0.14, v - 0.14), (u + w + 0.14, v - 0.14), (u - 0.14, v + d + 0.14), (u + w + 0.14, v + d + 0.14)]:
            lathe(cu, cv, z + h + 0.5, [(0.03, 0), (0.0, 3)], gold, 6)
    box(1.8, 1.7, 0.4, 0.3, 161, 7, gold)
    roof(1.85, 1.7, 0.3, 0.3, 168, 10, mat(team, 0.4, metal=0.5, grain=0.03), kind="pyramid", overhang=0.02)
    lathe(2.0, 1.85, 178, [(0.04, 0), (0.025, 6), (0.06, 8), (0.0, 18)], gold, 12)
    render(f"techcenter-{f}", (4, 4), 210)


def europe(f):
    team = TEAM[f]
    C = (4.3, 4.3)
    RIN, ROUT = 2.35, 2.95
    A0, A1 = math.pi + 0.12, math.pi * 1.5 - 0.12
    Z0, ZT = 6, 150

    def at(r, a):
        return (C[0] + math.cos(a) * r, C[1] + math.sin(a) * r)

    box(0, 0, 4, 4, 0, 2, mat("#9aa0a6", 0.9, grain=0.15, scale=8))
    box(0.4, 0.4, 3.3, 3.3, 2, 4, mat("#e4e6e8", 0.8, grain=0.06))
    SEG = 36
    inner = [at(RIN, A0 + (A1 - A0) * i / SEG) for i in range(SEG + 1)]
    outer = [at(ROUT, A0 + (A1 - A0) * i / SEG) for i in range(SEG + 1)]
    poly = outer + list(reversed(inner))
    g = mat("#4f7fa8", 0.06, metal=0.4, grain=0.03, scale=3, glass=True)
    prism(poly, Z0, ZT - Z0, g, mat("#8a9096", 0.9, grain=0.1))
    white = mat("#eef0f1", 0.6, grain=0.04)
    # Floor bands round the curved wall: thin curved strips (ring prisms).
    for z in [Z0 + 4 + 4.6 * k for k in range(31)]:
        for r in (RIN, ROUT):
            a_ = [at(r - 0.02, A0 + (A1 - A0) * i / SEG) for i in range(SEG + 1)]
            b_ = [at(r + 0.02, A0 + (A1 - A0) * i / SEG) for i in range(SEG + 1)]
            prism(b_ + list(reversed(a_)), z, 0.9, white)
    mull = mat("#cfd8de", 0.4, metal=0.6, grain=0)
    for i in range(0, SEG + 1, 2):
        a = A0 + (A1 - A0) * i / SEG
        u, v = at(RIN - 0.01, a)
        box(u - 0.012, v - 0.012, 0.024, 0.024, Z0, ZT - Z0, mull)
    a_ = [at(RIN - 0.03, A0 + (A1 - A0) * i / SEG) for i in range(SEG + 1)]
    b_ = [at(RIN + 0.03, A0 + (A1 - A0) * i / SEG) for i in range(SEG + 1)]
    prism(b_ + list(reversed(a_)), ZT, 2, white)
    mu, mv = at(2.65, math.pi * 1.25)
    roof_kit(mu - 0.2, mv - 0.2, 0.4, 0.4, ZT)
    pyl = mat("#eceeef", 0.7, grain=0.06)
    slot = mat("#3a4a58", 0.1, grain=0, glass=True)
    for a in (A0 - 0.02, A1 + 0.02):
        pu, pv = at((RIN + ROUT) / 2, a)
        left = a < math.pi * 1.25
        u, v = pu - (0.3 if left else 0.25), pv - (0.25 if left else 0.3)
        box(u, v, 0.55, 0.55, 2, ZT + 10, pyl, bevel=0.01)
        for zz in range(10, ZT, 12):
            if left:
                box(u + 0.55, v + 0.2, 0.01, 0.15, zz, 6, slot)
            else:
                box(u + 0.2, v + 0.55, 0.15, 0.01, zz, 6, slot)
    flags = ["#1f3f9a", team, "#c8231e", "#f2c94c", "#2f8a4e", team, "#1f3f9a", "#e8e8e8", team]
    pole = mat("#f4f4f4", 0.4, metal=0.5, grain=0)
    for k, col in enumerate(flags):
        a = A0 + 0.1 + (A1 - A0 - 0.2) * k / (len(flags) - 1)
        u, v = at(RIN - 0.75, a)
        rod((u, v, zp(2)), (u, v, zp(26)), 0.01, pole)
        box(u, v, 0.18, 0.01, 22.5, 3.5, mat(col, 0.6, grain=0))
    render(f"techcenter-{f}", (4, 4), 170)


def islamic(f):
    team = TEAM[f]
    stone, glass = "#c2a77c", "#3a5a5a"
    podium(stone, glass, team, 18, arched=True)
    g = glassm(glass)
    fr = mat(stone, 0.7, grain=0.05)
    green = mat("#2f7a52", 0.35, metal=0.4, grain=0.04)
    gold = mat("#e8c860", 0.3, metal=0.9, grain=0)
    tb = mat(team, 0.5, grain=0.03)
    for u, v, w, d, z, h, fl in [(0.9, 1.4, 0.7, 0.9, 20, 50, 8), (1.4, 0.9, 0.9, 0.7, 20, 66, 10), (1.4, 1.3, 1.2, 1.1, 22, 80, 12)]:
        curtain(u, v, w, d, z, h, g, fr, fl, mull=5)
        box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, z + h - 3, 3, tb)
    curtain(1.6, 1.5, 0.8, 0.7, 102, 30, g, fr, 5, mull=5)
    cylinder(2.0, 1.85, 0.32, 132, 6, mat(stone, 0.8, grain=0.1))
    dome(2.0, 1.85, 0.34, 138, 12, green)
    lathe(2.0, 1.85, 150, [(0.07, 0), (0.05, 20), (0.025, 40)], mat("#d8d0c0", 0.5, metal=0.4, grain=0), 16, cap_top=True)
    lathe(2.0, 1.85, 190, [(0.015, 0), (0.0, 8)], gold, 8)
    for u, v in [(0.4, 3.6), (3.6, 0.4), (3.6, 3.6)]:
        cylinder(u, v, 0.27, 20, 1.5, mat(stone, 0.8, grain=0.1))
        dome(u, v, 0.25, 21.5, 8, green)
        lathe(u, v, 29.5, [(0.012, 0), (0.0, 4)], gold, 6)
    render(f"techcenter-{f}", (4, 4), 210)


_BUILD = {"usa": usa, "russia": russia, "china": china, "europe": europe, "islamic": islamic}
MODELS = {f"techcenter-{f}": (lambda f=f: _BUILD[f](f)) for f in TEAM}

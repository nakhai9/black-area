"""The five faction capitals and the Global Monitoring Center (World Bank).

Each landmark is laid out in the 4-unit art space of its old vector art and scaled by S = 1.25 (u, v and height) to
fill its real plot (5 × 5, the White House 5 × 3), so the flag poles and animated parts in the TS files keep their
coordinates × S.
"""
import math

import bmesh

from kit import _obj, box, cylinder, dome, lathe, mat, render, rod, roof, zp, prism

S = 1.25


# ---------------------------------------------------------------- scaled helpers (author units)


def B(u, v, w, d, z, h, m, bevel=0.0):
    return box(u * S, v * S, w * S, d * S, z * S, h * S, m, bevel)


def CYL(cu, cv, r, z, h, m, segs=32):
    return cylinder(cu * S, cv * S, r * S, z * S, h * S, m, segs)


def DOME(cu, cv, r, z, h, m, onion=False, segs=32):
    return dome(cu * S, cv * S, r * S, z * S, h * S, m, segs=segs, onion=onion)


def LATHE(cu, cv, z, prof, m, segs=48, **kw):
    return lathe(cu * S, cv * S, z * S, [(r * S, hz * S) for r, hz in prof], m, segs, **kw)


def ROOF(u, v, w, d, z, h, m, kind="hip", ridge="u", over=0.08):
    return roof(u * S, v * S, w * S, d * S, z * S, h * S, m, kind=kind, ridge=ridge, overhang=over * S)


def ROD(a, b, r, m, segs=6):
    return rod((a[0] * S, a[1] * S, zp(a[2] * S)), (b[0] * S, b[1] * S, zp(b[2] * S)), r * S, m, segs)


def PRISM(poly, z, h, m, top=None):
    return prism([(u * S, v * S) for u, v in poly], z * S, h * S, m, top)


def facepoly(face, u, v, w, d, pts, m, depth=0.015):
    """Flat plate on a box face ("left" = +v face, s along u; "right" = +u face, s along v), pts [(s tiles, z px)]."""
    bm = bmesh.new()

    def P(s, z, t):
        if face == "left":
            return ((u + s) * S, (v + d + t) * S, zp(z * S))
        return ((u + w + t) * S, (v + s) * S, zp(z * S))

    a = [bm.verts.new(P(s, z, 0)) for s, z in pts]
    b = [bm.verts.new(P(s, z, depth)) for s, z in pts]
    n = len(pts)
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("plate", bm, m)


def arch_pts(s0, s1, z, h, pointed=True, n=8):
    spring = z + h * (0.62 if pointed else 0.7)
    mid = (s0 + s1) / 2
    pts = [(s0, z), (s1, z), (s1, spring)]
    for i in range(1, n):
        t = i / n
        a = t * math.pi
        x = mid + (s1 - s0) / 2 * math.cos(a)
        if pointed:
            y = spring + (z + h - spring) * math.sin(a) ** 0.7 * (1 - 0.0)
        else:
            y = spring + (z + h - spring) * math.sin(a)
        pts.append((x, y))
    pts.append((s0, spring))
    return pts


def face_len(face, w, d):
    return w if face == "left" else d


def grid(face, u, v, w, d, z, h, cols, rows, glass, frame, fill=0.55, margin=0.08, sill=None, pediment=None):
    """Window grid with frames (and optional sills / little pediments) on a box face, in author units."""
    L = face_len(face, w, d)
    for c in range(cols):
        s0 = L * (margin + (1 - 2 * margin) * (c + (1 - fill) / 2) / cols)
        s1 = s0 + L * (1 - 2 * margin) * fill / cols
        for r in range(rows):
            t0 = z + h * (0.18 + r) / rows
            th = h * 0.6 / rows
            fw = (s1 - s0) * 0.14
            facepoly(face, u, v, w, d, [(s0 - fw, t0 - 0.6), (s1 + fw, t0 - 0.6), (s1 + fw, t0 + th + 0.6), (s0 - fw, t0 + th + 0.6)], frame, 0.012)
            facepoly(face, u, v, w, d, [(s0, t0), (s1, t0), (s1, t0 + th), (s0, t0 + th)], glass, 0.016)
            # glazing bar
            facepoly(face, u, v, w, d, [((s0 + s1) / 2 - fw * 0.25, t0), ((s0 + s1) / 2 + fw * 0.25, t0), ((s0 + s1) / 2 + fw * 0.25, t0 + th), ((s0 + s1) / 2 - fw * 0.25, t0 + th)], frame, 0.02)
            if sill is not None:
                facepoly(face, u, v, w, d, [(s0 - fw * 2, t0 - 1.2), (s1 + fw * 2, t0 - 1.2), (s1 + fw * 2, t0 - 0.4), (s0 - fw * 2, t0 - 0.4)], sill, 0.03)
            if pediment is not None:
                facepoly(face, u, v, w, d, [(s0 - fw * 2, t0 + th + 1), (s1 + fw * 2, t0 + th + 1), ((s0 + s1) / 2, t0 + th + 3)], pediment, 0.03)


def balustrade(u0, v0, u1, v1, z, h, m, step=0.07):
    """Rail on balusters along a straight line (author units)."""
    L = math.dist((u0, v0), (u1, v1))
    n = max(2, int(L / step))
    for i in range(n + 1):
        t = i / n
        cu, cv = u0 + (u1 - u0) * t, v0 + (v1 - v0) * t
        CYL(cu, cv, 0.014, z, h * 0.8, m, 6)
    t = 0.02
    B(min(u0, u1) - t, min(v0, v1) - t, abs(u1 - u0) + 2 * t, abs(v1 - v0) + 2 * t, z + h * 0.8, h * 0.2, m)


def ring_balustrade(u, v, w, d, z, h, m, step=0.07):
    balustrade(u, v, u + w, v, z, h, m, step)
    balustrade(u, v + d, u + w, v + d, z, h, m, step)
    balustrade(u, v, u, v + d, z, h, m, step)
    balustrade(u + w, v, u + w, v + d, z, h, m, step)


def tree(cu, cv, r, z, h, leaf):
    CYL(cu, cv, 0.025, z, h * 0.4, mat("#4a3a28", 0.9), 6)
    DOME(cu, cv, r, z + h * 0.3, h * 0.7, leaf, segs=16)
    DOME(cu + r * 0.3, cv - r * 0.2, r * 0.7, z + h * 0.45, h * 0.6, leaf, segs=16)


# ================================================================ White House


def white_house():
    white = mat("#ebe8de", 0.75, grain=0.06, scale=30)
    white2 = mat("#dcd8cc", 0.8, grain=0.06, scale=30)
    stone = mat("#a29e92", 0.9, grain=0.12, scale=10)
    roofm = mat("#6c7076", 0.6, metal=0.3, grain=0.05)
    glass = mat("#26303c", 0.1, grain=0, glass=True)
    frame = mat("#f6f3ea", 0.6, grain=0)
    dark = mat("#3b3a36", 0.8, grain=0)
    col = mat("#f8f5ee", 0.6, grain=0.04)
    D = 2.4
    B(0, 0, 4, D, 0, 3, stone)
    # West and East Wings: low flat-roofed, colonnaded fronts.
    for wu in (0.05, 3.25):
        B(wu, 0.1, 0.7, 2.2, 3, 12, white)
        grid("left", wu, 0.1, 0.7, 2.2, 3, 12, 3, 2, glass, frame, fill=0.45)
        grid("right", wu, 0.1, 0.7, 2.2, 3, 12, 9, 2, glass, frame, fill=0.45)
        B(wu - 0.03, 0.07, 0.76, 2.26, 15, 1.2, white2)
        B(wu, 0.1, 0.7, 2.2, 16.2, 0.4, roofm)
        ring_balustrade(wu + 0.02, 0.12, 0.66, 2.16, 16.2, 2.0, white, 0.09)
    # Executive Residence.
    u, v, w, d = 0.75, 0.1, 2.5, 1.75
    B(u, v, w, d, 3, 10, white2)
    grid("left", u, v, w, d, 3, 10, 12, 1, glass, frame, fill=0.42, sill=white)
    grid("right", u, v, w, d, 3, 10, 8, 1, glass, frame, fill=0.42, sill=white)
    B(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 13, 1, white2)
    B(u, v, w, d, 14, 14, white)
    grid("left", u, v, w, d, 14, 14, 12, 1, glass, frame, fill=0.5, sill=white, pediment=white)
    grid("right", u, v, w, d, 14, 14, 8, 1, glass, frame, fill=0.5, sill=white, pediment=white)
    # Pilasters between bays.
    for i in range(13):
        s = 0.08 + (w - 0.16) * i / 12
        B(u + s - 0.02, v + d, 0.04, 0.02, 3, 25, white)
    for i in range(9):
        s = 0.08 + (d - 0.16) * i / 8
        B(u + w, v + s - 0.02, 0.02, 0.04, 3, 25, white)
    B(u - 0.05, v - 0.05, w + 0.1, d + 0.1, 28, 2.2, white)
    B(u - 0.03, v - 0.03, w + 0.06, d + 0.06, 27.2, 0.8, white2)
    B(u, v, w, d, 30.2, 0.5, roofm)
    ring_balustrade(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 30.2, 2.6, white, 0.07)
    ROOF(u + 0.18, v + 0.18, w - 0.36, d - 0.36, 30.7, 4, roofm, over=0)
    for cu in (u + 0.25, u + w - 0.25):
        for cv in (v + 0.4, v + d - 0.4):
            B(cu - 0.06, cv - 0.06, 0.12, 0.12, 30.7, 8, white2)
            B(cu - 0.07, cv - 0.07, 0.14, 0.14, 38.2, 0.8, white)
    # North Portico.
    pu, pw, pv = 1.55, 0.9, v + d
    B(pu - 0.05, pv, pw + 0.1, 0.55, 3, 2, white2)
    for k in range(3):
        B(pu + 0.1, pv + 0.5 + k * 0.03, pw - 0.2, 0.03, 3 - k * 0.7, 0.7, stone)
    facepoly("left", u, v, w, d, [(0.95, 3), (1.25, 3), (1.25, 12), (0.95, 12)], dark, 0.01)
    facepoly("left", u, v, w, d, [(0.98, 12.5), (1.22, 12.5), (1.1, 15)], white, 0.02)
    for k in range(4):
        cu = pu + 0.1 + k * 0.233
        CYL(cu, pv + 0.42, 0.06, 5, 1.2, white)
        LATHE(cu, pv + 0.42, 6.2, [(0.05, 0), (0.042, 21)], col, 20, cap_top=True)
        B(cu - 0.06, pv + 0.36, 0.12, 0.12, 27.2, 0.9, white)
    B(pu, pv, pw, 0.52, 28, 2.2, white)
    ROOF(pu, pv - 0.05, pw, 0.57, 30.2, 7, roofm, kind="gable", ridge="u", over=0.03)
    facepoly("left", pu - 0.03, pv - 0.05, pw + 0.06, 0.57, [(0, 30.2), (pw + 0.06, 30.2), ((pw + 0.06) / 2, 37.2)], white, 0.04)
    facepoly("left", pu - 0.03, pv - 0.04, pw + 0.06, 0.57, [(0.1, 31), (pw - 0.04, 31), ((pw + 0.06) / 2, 35.8)], white2, 0.04)
    # Lantern over the door.
    CYL(1.99, pv + 0.22, 0.035, 18, 3, mat("#e8dfb8", 0.3, grain=0, emit="#ffe9a8"))
    render("capital-usa", (5, 3), 40 * S)


# ================================================================ Kremlin

K_WALL = 16
K_TOWER = 0.46


def k_mats():
    return dict(
        brick=mat("#8e3424", 0.9, grain=0.18, scale=40),
        cap=mat("#a2402e", 0.9, grain=0.15, scale=40),
        cream=mat("#e6d6a2", 0.8, grain=0.07, scale=30),
        green=mat("#4f8e60", 0.55, metal=0.2, grain=0.06),
        spire=mat("#2f6a48", 0.5, metal=0.2, grain=0.05),
        gold=mat("#d9a63a", 0.25, metal=1.0, grain=0.04),
        white=mat("#ece6d6", 0.8, grain=0.06, scale=30),
        stone=mat("#f0ebdf", 0.8, grain=0.05),
        glass=mat("#2c3a4e", 0.1, grain=0, glass=True),
        dark=mat("#2a0f0b", 0.9, grain=0),
        star=mat("#c41a14", 0.3, grain=0, emit="#ff2a1a"),
    )


def k_wall(M, u, v, w, d):
    B(u, v, w, d, 0, K_WALL, M["brick"])
    B(u - 0.01, v - 0.01, w + 0.02, d + 0.02, 0, 2, M["cap"])
    along_u = w >= d
    L = w if along_u else d
    n = max(1, int(L / 0.17))
    for i in range(n):
        t = (i + 0.5) * (L / n) - 0.05
        if along_u:
            B(u + t, v, 0.1, d, K_WALL, 2.5, M["cap"])
            B(u + t, v, 0.035, d, K_WALL + 2.5, 2, M["cap"])
            B(u + t + 0.065, v, 0.035, d, K_WALL + 2.5, 2, M["cap"])
        else:
            B(u, v + t, w, 0.1, K_WALL, 2.5, M["cap"])
            B(u, v + t, w, 0.035, K_WALL + 2.5, 2, M["cap"])
            B(u, v + t + 0.065, w, 0.035, K_WALL + 2.5, 2, M["cap"])


def k_star(M, cu, cv, z, s):
    ROD((cu, cv, z - 4), (cu, cv, z), 0.008, M["gold"])
    # A small 3D star seen from both sides: two crossed star plates.
    for face in ("left", "right"):
        pts = []
        for k in range(10):
            a = math.pi / 2 + k * math.pi / 5
            r = (s if k % 2 == 0 else s * 0.42) * 0.025
            pts.append((r * math.cos(a), z + s * 0.9 + (r / 0.025) * math.sin(a)))
        if face == "left":
            facepoly("left", cu, cv - 0.006, 0, 0, pts, M["star"], 0.012)
        else:
            facepoly("right", cu - 0.006, cv, 0, 0, pts, M["star"], 0.012)


def k_tower(M, u, v, star=None):
    s = K_TOWER
    cu, cv = u + s / 2, v + s / 2
    B(u, v, s, s, 0, 22, M["brick"])
    for face in ("left", "right"):
        facepoly(face, u, v, s, s, arch_pts(0.17, 0.29, 4, 6, False), M["dark"], 0.01)
        facepoly(face, u, v, s, s, arch_pts(0.19, 0.27, 13, 5, False), M["dark"], 0.01)
    B(u - 0.03, v - 0.03, s + 0.06, s + 0.06, 22, 3, M["cap"])
    B(u + 0.08, v + 0.08, s - 0.16, s - 0.16, 25, 6, M["brick"])
    B(u + 0.06, v + 0.06, s - 0.12, s - 0.12, 30.5, 0.8, M["stone"])
    ROOF(u + 0.06, v + 0.06, s - 0.12, s - 0.12, 31, 16, M["spire"], kind="pyramid", over=0.01)
    if star:
        k_star(M, cu, cv, 47, star)


def k_onion(M, u, v, z, r):
    CYL(u, v, r * 0.75, z, r * 22, M["white"], 16)
    DOME(u, v, r, z + r * 22, r * 70, M["gold"], onion=True, segs=24)
    ROD((u, v, z + r * 22 + r * 70 - 1), (u, v, z + r * 22 + r * 70 + 4), 0.006, M["gold"])


def k_cathedral(M, u, v):
    w = 0.62
    B(u, v, w, w, 0, 15, M["white"])
    for face in ("left", "right"):
        for k in range(3):
            s = 0.1 + k * 0.18
            facepoly(face, u, v, w, w, arch_pts(s + 0.04, s + 0.1, 3, 6, False), M["dark"], 0.01)
            facepoly(face, u, v, w, w, arch_pts(s, s + 0.14, 10, 5.5, False, 10), M["stone"], 0.012)
    B(u - 0.02, v - 0.02, w + 0.04, w + 0.04, 15, 1, M["stone"])
    B(u + 0.02, v + 0.02, w - 0.04, w - 0.04, 16, 0.6, M["gold"])
    for du, dv in ((0.15, 0.15), (w - 0.15, 0.15), (0.15, w - 0.15), (w - 0.15, w - 0.15)):
        k_onion(M, u + du, v + dv, 16, 0.1)
    k_onion(M, u + w / 2, v + w / 2, 16, 0.15)


def k_ivan(M, u, v):
    for r, z, h in ((0.3, 0, 24), (0.25, 24, 14), (0.2, 38, 11)):
        CYL(u, v, r, z, h, M["white"], 8)
        CYL(u, v, r + 0.03, z + h - 1.2, 1.2, M["stone"], 8)
        for k in range(8):
            a = 2 * math.pi * (k + 0.5) / 8
            ROD((u + math.cos(a) * r * 0.93, v + math.sin(a) * r * 0.93, z + h * 0.45), (u + math.cos(a) * r * 0.93, v + math.sin(a) * r * 0.93, z + h * 0.8), 0.03, M["dark"], 4)
    CYL(u, v, 0.15, 49, 9, M["gold"], 24)
    DOME(u, v, 0.2, 58, 15, M["gold"], onion=True)
    ROD((u, v, 72), (u, v, 79), 0.007, M["gold"])


def k_big_tower(M, cu, cv):
    CYL(cu, cv, 0.36, 0, 30, M["brick"], 32)
    for k in range(10):
        a = 2 * math.pi * k / 10
        B(cu + math.cos(a) * 0.37 - 0.04, cv + math.sin(a) * 0.37 - 0.04, 0.08, 0.08, 30, 5, M["cap"])
    CYL(cu, cv, 0.39, 28, 2, M["cap"], 32)
    CYL(cu, cv, 0.28, 33, 9, M["brick"], 24)
    CYL(cu, cv, 0.3, 42, 1.5, M["stone"], 24)
    CYL(cu, cv, 0.2, 43.5, 6, M["brick"], 16)
    LATHE(cu, cv, 49.5, [(0.22, 0), (0.0005, 30)], M["spire"], 8, cap_bottom=True)
    k_star(M, cu, cv, 80, 4.6)


def kremlin():
    M = k_mats()
    B(0.02, 0.02, 3.96, 3.96, 0, 0.4, mat("#7a8a52", 0.95, grain=0.2, scale=12))
    # Paths.
    B(1.1, 1.1, 2.6, 2.6, 0.4, 0.1, mat("#b9b0a0", 0.95, grain=0.1))
    k_wall(M, 0.02, 0.02, 3.5, 0.26)
    k_wall(M, 0.02, 0.28, 0.26, 3.24)
    # Grand Kremlin Palace.
    def wing(u, v, w, d):
        B(u, v, w, d, 0, 26, M["cream"])
        B(u - 0.01, v - 0.01, w + 0.02, d + 0.02, 0, 3, mat("#cdbb88", 0.85))
        grid("left", u, v, w, d, 2, 24, round(w * 7), 3, M["glass"], M["stone"], fill=0.5, pediment=M["stone"])
        grid("right", u, v, w, d, 2, 24, round(d * 7), 3, M["glass"], M["stone"], fill=0.5, pediment=M["stone"])
        B(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 26, 1.5, M["stone"])
        ROOF(u, v, w, d, 27.5, 7, M["green"], over=0.04)

    wing(1.06, 0.28, 2.4, 0.86)
    wing(0.28, 1.06, 0.86, 2.4)
    B(0.28, 0.28, 0.78, 0.78, 0, 32, M["cream"])
    grid("left", 0.28, 0.28, 0.78, 0.78, 2, 30, 5, 3, M["glass"], M["stone"], fill=0.5)
    grid("right", 0.28, 0.28, 0.78, 0.78, 2, 30, 5, 3, M["glass"], M["stone"], fill=0.5)
    B(0.26, 0.26, 0.82, 0.82, 32, 2, M["stone"])
    ROOF(0.28, 0.28, 0.78, 0.78, 34, 4, M["green"], over=0.03)
    CYL(0.66, 0.66, 0.22, 36, 8, M["cream"], 24)
    DOME(0.66, 0.66, 0.24, 44, 11, M["gold"])
    k_tower(M, 3.52, 0.02, 3)
    k_tower(M, 0.02, 3.52, 3)
    leaves = [mat(c, 0.9, grain=0.3, scale=25) for c in ("#4f7a34", "#c7962c", "#a5552a", "#6b8a3a")]
    for i, (u, v) in enumerate([(1.45, 1.45), (2.7, 1.5), (1.5, 2.7), (3.2, 2.2), (2.2, 3.2), (2.95, 2.95), (3.3, 2.75), (2.75, 3.3), (1.2, 2.0), (2.0, 1.2)]):
        tree(u, v, 0.2, 0.5, 13, leaves[i % 4])
    k_cathedral(M, 2.55, 1.2)
    k_cathedral(M, 1.2, 2.55)
    k_ivan(M, 2.1, 2.1)
    k_wall(M, 3.72, 0.48, 0.26, 2.86)
    k_wall(M, 0.48, 3.72, 2.86, 0.26)
    k_tower(M, 3.62, 1.67, 2.6)
    k_tower(M, 1.67, 3.62, 2.6)
    k_big_tower(M, 3.62, 3.62)
    render("capital-russia", (5, 5), 92 * S)


# ================================================================ Zhongnanhai


def z_mats():
    return dict(
        red=mat("#8e2a1e", 0.8, grain=0.1, scale=25),
        col=mat("#a83224", 0.6, grain=0.05),
        lattice=mat("#4a150f", 0.8, grain=0),
        tile=mat("#d98c2a", 0.35, grain=0.12, scale=60),
        tile2=mat("#c47a22", 0.4, grain=0.12, scale=60),
        marble=mat("#e2ddd0", 0.7, grain=0.06),
        marble_d=mat("#b9b3a4", 0.85, grain=0.1),
        teal=mat("#2f6f6a", 0.6, grain=0.05),
        blue=mat("#2b4f7a", 0.6, grain=0.05),
        gold=mat("#e0b440", 0.3, metal=0.9, grain=0),
        stone=mat("#8f8a80", 0.95, grain=0.15, scale=10),
        base=mat("#8c8880", 0.9, grain=0.12),
        door=mat("#7c1a12", 0.7, grain=0.05),
        pine=mat("#35603a", 0.9, grain=0.3, scale=25),
    )


def z_hall(M, u, v, w, d, z, h, cols):
    """Recessed red wall behind a row of red columns, with teal / blue painted bracket bands under the eave."""
    B(u + 0.06, v + 0.06, w - 0.12, d - 0.12, z, h, M["red"])
    for face in ("left", "right"):
        n = cols if face == "left" else max(2, round(cols * d / w))
        L = w if face == "left" else d
        for i in range(n):
            s0 = 0.06 + (L - 0.12) * (i + 0.18) / n
            s1 = 0.06 + (L - 0.12) * (i + 0.82) / n
            if face == "left":
                facepoly("left", u, v - 0.06, w, d, [(s0, z + 1), (s1, z + 1), (s1, z + h * 0.72), (s0, z + h * 0.72)], M["lattice"], 0.01)
            else:
                facepoly("right", u - 0.06, v, w, d, [(s0, z + 1), (s1, z + 1), (s1, z + h * 0.72), (s0, z + h * 0.72)], M["lattice"], 0.01)
    for i in range(cols + 1):
        cu = u + 0.04 + (w - 0.08) * i / cols
        CYL(cu, v + d - 0.04, 0.03, z, h * 0.78, M["col"], 10)
        CYL(cu, v + 0.04, 0.03, z, h * 0.78, M["col"], 10)
    n = max(2, round(cols * d / w))
    for i in range(1, n):
        cv = v + 0.04 + (d - 0.08) * i / n
        CYL(u + w - 0.04, cv, 0.03, z, h * 0.78, M["col"], 10)
        CYL(u + 0.04, cv, 0.03, z, h * 0.78, M["col"], 10)
    B(u, v, w, d, z + h * 0.78, h * 0.11, M["teal"])
    B(u - 0.02, v - 0.02, w + 0.04, d + 0.04, z + h * 0.89, h * 0.11, M["blue"])


def z_roof(M, u, v, w, d, z, h, over, ridge_h=1.5, tile=None):
    """Curved glazed hip-and-gable roof: a shallow flared skirt under a steep upper hip, ridge, upturned corners."""
    tile = tile or M["tile"]
    ROOF(u, v, w, d, z, h * 0.35, tile, over=over)
    ROOF(u + over * 0.2, v + over * 0.2, w - over * 0.4, d - over * 0.4, z + h * 0.18, h * 0.82, tile, over=0.0)
    inset = min(w, d) / 2
    B(u + inset - 0.04, v + d / 2 - 0.03, w - 2 * inset + 0.08, 0.06, z + h - 0.3, ridge_h, M["tile2"])
    for cu, cv, du, dv in ((u - over, v - over, -1, -1), (u + w + over, v - over, 1, -1), (u - over, v + d + over, -1, 1), (u + w + over, v + d + over, 1, 1)):
        ROD((cu - du * 0.05, cv - dv * 0.05, z + 0.3), (cu + du * 0.04, cv + dv * 0.04, z + 2.6), 0.018, tile, 6)


def zhongnanhai():
    M = z_mats()
    B(0, 0, 4, 4, 0, 1, M["stone"])
    B(0.03, 0.03, 3.94, 3.94, 1, 0.05, mat("#a9a49a", 0.95, grain=0.18, scale=6))
    for u in (0.25, 2.95):
        tree(u + 0.4, 0.45, 0.45, 1, 22, mat("#3f6a3a", 0.9, grain=0.3, scale=25))
    # Compound hall behind.
    B(1.0, 0.1, 2.0, 0.9, 1, 2, M["marble"])
    z_hall(M, 1.1, 0.2, 1.8, 0.7, 3, 9, 7)
    z_roof(M, 1.1, 0.2, 1.8, 0.7, 12, 6, 0.12)
    for u in (0.05, 3.7):
        B(u, 1.2, 0.25, 1.4, 1, 8, M["red"])
        ROOF(u, 1.2, 0.25, 1.4, 9, 2.5, M["tile"], over=0.05)
    # Xinhuamen.
    G0, GW, GV, GD = 0.55, 2.9, 1.75, 1.2
    B(G0 - 0.12, GV - 0.12, GW + 0.24, GD + 0.24, 1, 2, M["base"])
    z_hall(M, G0, GV, GW, GD, 3, 15, 10)
    for k, dw in ((1, 0.28), (2, 0.34), (3, 0.28)):
        cs = (k + 0.5) / 5 * GW
        facepoly("left", G0, GV - 0.05, GW, GD, [(cs - dw / 2, 3), (cs + dw / 2, 3), (cs + dw / 2, 12.5), (cs - dw / 2, 12.5)], M["door"], 0.02)
        for r in range(1, 5):
            for c in range(1, 4):
                x = cs - dw / 2 + c * dw / 4
                facepoly("left", G0, GV - 0.05, GW, GD, [(x - 0.01, 3 + r * 1.9 - 0.3), (x + 0.01, 3 + r * 1.9 - 0.3), (x + 0.01, 3 + r * 1.9 + 0.3), (x - 0.01, 3 + r * 1.9 + 0.3)], M["gold"], 0.03)
    facepoly("left", G0, GV - 0.05, GW, GD, [(GW / 2 - 0.15, 13.3), (GW / 2 + 0.15, 13.3), (GW / 2 + 0.15, 15.9), (GW / 2 - 0.15, 15.9)], M["gold"], 0.025)
    facepoly("left", G0, GV - 0.05, GW, GD, [(GW / 2 - 0.13, 13.6), (GW / 2 + 0.13, 13.6), (GW / 2 + 0.13, 15.6), (GW / 2 - 0.13, 15.6)], mat("#c8261d", 0.6, grain=0), 0.03)
    z_roof(M, G0, GV, GW, GD, 18, 4, 0.18, 0.8)
    U0, UW, UV, UD = G0 + 0.22, GW - 0.44, GV + 0.2, GD - 0.4
    B(U0 - 0.05, UV - 0.05, UW + 0.1, UD + 0.1, 20.5, 0.6, M["marble"])
    ring_balustrade(U0 - 0.08, UV - 0.08, UW + 0.16, UD + 0.16, 21, 2.4, M["marble"], 0.08)
    z_hall(M, U0, UV, UW, UD, 21, 12, 9)
    # National emblem: gold-ringed red disc.
    cs = UW / 2
    ring = [(cs + 0.11 * math.cos(2 * math.pi * k / 20), 29.2 + 2.8 * math.sin(2 * math.pi * k / 20)) for k in range(20)]
    inner = [(cs + 0.086 * math.cos(2 * math.pi * k / 20), 29.2 + 2.2 * math.sin(2 * math.pi * k / 20)) for k in range(20)]
    facepoly("left", U0, UV, UW, UD, ring, M["gold"], 0.02)
    facepoly("left", U0, UV, UW, UD, inner, mat("#c8261d", 0.5, grain=0), 0.03)
    z_roof(M, U0, UV, UW, UD, 33, 9, 0.22, 2.5)
    for fu in (U0 + UW * 0.22, U0 + UW * 0.78 - 0.08):
        B(fu, UV + UD / 2 - 0.04, 0.08, 0.08, 41, 4, M["tile2"])
    B(U0 + UW / 2 - 0.05, UV + UD / 2 - 0.05, 0.1, 0.1, 41, 3, M["gold"])
    # Slogan walls (the white characters are painted on in the game).
    for u, w in ((0.0, 0.5), (3.5, 0.5)):
        B(u, 2.75, w, 0.3, 1, 10, M["red"])
        B(u - 0.01, 2.74, w + 0.02, 0.32, 1, 1.2, M["marble_d"])
        z_roof(M, u, 2.75, w, 0.3, 11, 2.6, 0.06, 0.5)
    # Lions and potted pines.
    for u in (0.62, 3.16):
        B(u, 3.2, 0.22, 0.14, 1, 4, M["marble_d"])
        B(u + 0.04, 3.22, 0.14, 0.1, 5, 4, M["stone"], 0.01)
        DOME(u + 0.11, 3.27, 0.06, 9, 4, M["stone"], segs=12)
    for u in (1.0, 3.0):
        B(u - 0.08, 3.2, 0.16, 0.16, 1, 2, M["marble_d"])
        DOME(u, 3.28, 0.14, 3, 7, M["pine"], segs=16)
    # Flagpole pedestal in front (the pole is drawn in the game).
    CYL(2.0, 3.62, 0.18, 1, 1.5, M["marble"])
    ring_balustrade(1.8, 3.42, 0.4, 0.4, 1, 2, M["marble"], 0.07)
    render("capital-china", (5, 5), 46 * S)


# ================================================================ EU headquarters


def eu():
    glass = mat("#3e5a74", 0.08, metal=0.3, grain=0.03, glass=True)
    glass2 = mat("#5a7c96", 0.08, metal=0.3, grain=0.03, glass=True)
    frame = mat("#c4c6c2", 0.4, metal=0.6, grain=0.03)
    core = mat("#b2b4b0", 0.6, grain=0.05)
    plaza = mat("#a3a39c", 0.95, grain=0.15, scale=8)
    steel = mat("#c9ccd0", 0.3, metal=0.9, grain=0)
    B(0, 0, 4, 4, 0, 3, plaza)

    def curtain(u, v, w, d, z, h):
        B(u, v, w, d, z, h, frame)
        floors = max(1, round(h / 4.5))
        for f in range(floors):
            t0 = z + h * (f + 0.25) / floors
            th = h * 0.6 / floors
            B(u - 0.005, v + 0.01, w + 0.01, d - 0.02, t0, th, glass)
            B(u + 0.01, v - 0.005, w - 0.02, d + 0.01, t0, th, glass)
        # Mullions.
        for c in range(1, round(w * 12)):
            B(u + w * c / round(w * 12) - 0.006, v + d - 0.004, 0.012, 0.012, z, h, frame)
        for c in range(1, round(d * 12)):
            B(u + w - 0.008, v + d * c / round(d * 12) - 0.006, 0.012, 0.012, z, h, frame)
        ring_balustrade(u + 0.02, v + 0.02, w - 0.04, d - 0.04, z + h, 1.6, frame, 0.25)
        B(u + w * 0.3, v + d * 0.3, min(0.3, w * 0.3), min(0.2, d * 0.3), z + h, 3, core)

    curtain(0.02, 0.02, 3.96, 0.6, 3, 36 * 0.6)
    curtain(0.02, 0.62, 0.9, 3.36, 3, 36 * 0.6)
    curtain(0.92, 0.62, 2.16, 3.36, 3, 9)
    curtain(3.08, 0.62, 0.9, 3.36, 3, 36 * 0.6)
    # Round glass tower.
    z0, h = 12, 71
    floors = round(h / 4.5)
    for f in range(floors):
        fz = z0 + f * h / floors
        r = 0.62 + (0.03 if f > floors * 0.7 and f % 2 else 0)
        CYL(2.0, 1.25, r, fz, h / floors * 0.72, glass if f % 3 else glass2, 48)
        CYL(2.0, 1.25, r + 0.02, fz + h / floors * 0.72, h / floors * 0.28, frame, 48)
    for k in range(24):
        a = 2 * math.pi * k / 24
        ROD((2.0 + math.cos(a) * 0.635, 1.25 + math.sin(a) * 0.635, z0), (2.0 + math.cos(a) * 0.635, 1.25 + math.sin(a) * 0.635, z0 + h), 0.006, frame, 4)
    CYL(2.0, 1.25, 0.64, 83, 1.2, core, 48)
    for k in range(16):
        a = 2 * math.pi * k / 16
        ROD((2.0 + math.cos(a) * 0.6, 1.25 + math.sin(a) * 0.6, 84), (2.0 + math.cos(a) * 0.6, 1.25 + math.sin(a) * 0.6, 92), 0.01, steel, 6)
    LATHE(2.0, 1.25, 92, [(0.6, 0), (0.66, 0), (0.66, 0.8), (0.6, 0.8)], steel, 48, cap_top=False)
    # Hemicycle.
    hz = 12
    CYL(2.0, 2.65, 0.85, hz, 12, frame, 48)
    for k in range(20):
        a = 2 * math.pi * k / 20
        B(2.0 + math.cos(a) * 0.85 - 0.03, 2.65 + math.sin(a) * 0.85 - 0.03, 0.06, 0.06, hz, 12, core)
    CYL(2.0, 2.65, 0.865, hz + 4, 4, glass, 48)
    CYL(2.0, 2.65, 0.86, hz + 9, 2, mat("#2a4f9e", 0.5, grain=0), 48)
    DOME(2.0, 2.65, 0.82, hz + 12, 14, mat("#8fc0dc", 0.05, metal=0.2, grain=0, glass=True), segs=48)
    for k in range(12):
        a = 2 * math.pi * k / 12
        prof = [(0.83 * math.cos(t / 10 * math.pi / 2), 14 * math.sin(t / 10 * math.pi / 2)) for t in range(11)]
        for i in range(10):
            (r0, z0_), (r1, z1_) = prof[i], prof[i + 1]
            ROD((2.0 + math.cos(a) * r0, 2.65 + math.sin(a) * r0, hz + 12 + z0_), (2.0 + math.cos(a) * r1, 2.65 + math.sin(a) * r1, hz + 12 + z1_), 0.006, steel, 4)
    gold = mat("#ffcc00", 0.3, metal=0.8, grain=0, emit="#ffcc00")
    for i in range(12):
        a = 2 * math.pi * i / 12 - math.pi / 2
        DOME(2.0 + math.cos(a) * 0.5, 2.65 + math.sin(a) * 0.5, 0.035, hz + 22.5, 2, gold, segs=8)
    ROD((2.0, 2.65, hz + 25), (2.0, 2.65, hz + 31), 0.008, steel)
    render("capital-europe", (5, 5), 94 * S)


# ================================================================ Grand Mosque


def m_mats():
    return dict(
        sand=mat("#cbb58a", 0.85, grain=0.1, scale=30),
        stone=mat("#ad9b78", 0.9, grain=0.15, scale=10),
        tile=mat("#1f8a52", 0.3, grain=0.12, scale=80),
        tile_d=mat("#145f3a", 0.35, grain=0.1, scale=80),
        tile_deep=mat("#0f4a30", 0.4, grain=0.1),
        gold=mat("#c49a3e", 0.3, metal=0.9, grain=0),
        dark=mat("#2b2219", 0.95, grain=0),
        cream=mat("#f2e6c4", 0.6, grain=0),
    )


def m_box(M, u, v, w, d, z, h):
    B(u, v, w, d, z, h, M["sand"])
    B(u - 0.01, v - 0.01, w + 0.02, d + 0.02, z, h * 0.08, mat("#a8916a", 0.9, grain=0.12))
    B(u - 0.005, v - 0.005, w + 0.01, d + 0.01, z + h * 0.88, h * 0.08, M["tile"])
    B(u - 0.02, v - 0.02, w + 0.04, d + 0.04, z + h, 0.8, M["sand"])
    for e in ((u, v, w, 0.05), (u, v + d - 0.05, w, 0.05), (u, v, 0.05, d), (u + w - 0.05, v, 0.05, d)):
        B(*e, z + h + 0.8, 1.6, M["sand"])


def m_arcade(M, face, u, v, w, d, z, h, n, rows):
    L = face_len(face, w, d)
    bay = L / n
    for r in range(rows):
        zz = z + h / rows * r + 1
        hh = h / rows - 2.5
        for i in range(n):
            facepoly(face, u, v, w, d, arch_pts(i * bay + bay * 0.14, i * bay + bay * 0.86, zz, hh), M["tile"], 0.01)
            facepoly(face, u, v, w, d, arch_pts(i * bay + bay * 0.24, i * bay + bay * 0.76, zz, hh * 0.86), M["dark"], 0.016)


def m_iwan(M, u, v, w, d, z, h):
    B(u, v, w, d, z, h, M["sand"])
    facepoly("left", u, v, w, d, [(w * 0.08, z), (w * 0.92, z), (w * 0.92, z + h * 0.94), (w * 0.08, z + h * 0.94)], M["tile_deep"], 0.01)
    facepoly("left", u, v, w, d, arch_pts(w * 0.17, w * 0.83, z, h * 0.86, n=14), M["tile"], 0.016)
    # A deep recess: the dark arch, then a half-dome hood of gold muqarnas.
    facepoly("left", u, v, w, d, arch_pts(w * 0.24, w * 0.76, z, h * 0.78, n=14), M["dark"], 0.022)
    facepoly("left", u, v, w, d, arch_pts(w * 0.34, w * 0.66, z + h * 0.56, h * 0.2, n=10), M["gold"], 0.026)
    facepoly("left", u, v, w, d, [(w * 0.42, z), (w * 0.58, z), (w * 0.58, z + h * 0.3), (w * 0.42, z + h * 0.3)], mat("#5a3a1e", 0.7, grain=0), 0.026)
    B(u - 0.01, v - 0.01, w + 0.02, d + 0.02, z + h * 0.94, h * 0.06, M["gold"])


def m_minaret(M, u, v, z):
    CYL(u, v, 0.13, z, 34, M["tile"], 16)
    for k in range(4):
        CYL(u, v, 0.135, z + 6 + k * 7, 0.8, M["cream"], 16)
    LATHE(u, v, z + 34, [(0.13, 0), (0.19, 2), (0.19, 3)], M["tile_deep"], 16, cap_top=True)
    ring_balustrade(u - 0.13, v - 0.13, 0.26, 0.26, z + 37, 1.5, M["sand"], 0.06)
    CYL(u, v, 0.1, z + 37, 9, M["sand"], 16)
    DOME(u, v, 0.12, z + 46, 6, M["tile"], segs=16)
    ROD((u, v, z + 52), (u, v, z + 56), 0.006, M["gold"])


def grand_mosque():
    M = m_mats()
    Z = 3
    B(0, 0, 4, 4, 0, Z, M["stone"])
    m_box(M, 0.02, 0.02, 0.7, 2.28, Z, 20)
    m_arcade(M, "left", 0.02, 0.02, 0.7, 2.28, Z, 20, 2, 2)
    m_box(M, 0.72, 0.02, 2.56, 2.03, Z, 30)
    m_arcade(M, "right", 0.72, 0.02, 2.56, 2.03, Z, 30, 4, 1)
    # Drum and the great dome (slightly pointed, tiled), with a gold crescent finial.
    CYL(2.0, 1.1, 0.8, Z + 30, 14, M["sand"], 48)
    for k in range(16):
        a = 2 * math.pi * (k + 0.5) / 16
        ROD((2.0 + math.cos(a) * 0.8, 1.1 + math.sin(a) * 0.8, Z + 31.5), (2.0 + math.cos(a) * 0.8, 1.1 + math.sin(a) * 0.8, Z + 36.5), 0.035, M["dark"], 4)
    CYL(2.0, 1.1, 0.82, Z + 38, 6, M["tile_deep"], 48)
    prof = []
    for i in range(21):
        t = i / 20
        r = 0.9 * math.sin(math.acos(t)) * (1 + 0.08 * math.sin(t * math.pi))
        prof.append((max(r * (1 - 0.15 * t ** 3), 0.001), 46 * (t ** 0.9)))
    LATHE(2.0, 1.1, Z + 44, prof, M["tile"], 48, cap_bottom=True)
    # Cream/gold ribs on the dome.
    for k in range(16):
        a = 2 * math.pi * k / 16
        for i in range(19):
            (r0, z0), (r1, z1) = prof[i], prof[i + 1]
            ROD((2.0 + math.cos(a) * r0 * 1.005, 1.1 + math.sin(a) * r0 * 1.005, Z + 44 + z0), (2.0 + math.cos(a) * r1 * 1.005, 1.1 + math.sin(a) * r1 * 1.005, Z + 44 + z1), 0.006, M["cream"], 4)
    CYL(2.0, 1.1, 0.91, Z + 44, 1.4, M["cream"], 48)
    ROD((2.0, 1.1, Z + 89), (2.0, 1.1, Z + 96), 0.01, M["gold"])
    for k, zz in enumerate((Z + 91, Z + 93.5)):
        DOME(2.0, 1.1, 0.04 - k * 0.012, zz, 2, M["gold"], segs=12)
    m_box(M, 3.28, 0.02, 0.7, 2.28, Z, 20)
    m_arcade(M, "right", 3.28, 0.02, 0.7, 2.28, Z, 20, 4, 2)
    m_arcade(M, "left", 3.28, 0.02, 0.7, 2.28, Z, 20, 2, 2)
    m_box(M, 0.02, 2.3, 1.13, 1.68, Z, 20)
    m_arcade(M, "left", 0.02, 2.3, 1.13, 1.68, Z, 20, 3, 2)
    m_iwan(M, 1.15, 1.95, 1.7, 0.6, Z, 56)
    m_box(M, 1.15, 2.55, 1.7, 1.43, Z, 14)
    m_arcade(M, "left", 1.15, 2.55, 1.7, 1.43, Z, 14, 5, 1)
    for k in range(3):
        DOME(1.45 + k * 0.55, 3.25, 0.2, Z + 14.8, 5, M["tile"], segs=24)
    m_minaret(M, 1.3, 2.25, Z + 56)
    m_minaret(M, 2.7, 2.25, Z + 56)
    m_box(M, 2.85, 2.3, 1.13, 1.68, Z, 20)
    m_arcade(M, "left", 2.85, 2.3, 1.13, 1.68, Z, 20, 3, 2)
    m_arcade(M, "right", 2.85, 2.3, 1.13, 1.68, Z, 20, 4, 2)
    render("capital-islamic", (5, 5), 115 * S)


# ================================================================ Global Monitoring Center


def worldbank():
    plaza = mat("#a29d92", 0.95, grain=0.15, scale=8)
    marble = mat("#ecebe6", 0.6, grain=0.05, scale=30)
    roofm = mat("#9aa0a3", 0.8, grain=0.08)
    glass = mat("#4f7473", 0.06, metal=0.3, grain=0.03, glass=True)
    lobby = mat("#3b4f55", 0.1, metal=0.2, grain=0, glass=True)
    mull = mat("#7fa3a2", 0.3, metal=0.6, grain=0)
    B(0, 0, 4, 4, 0, 3, plaza)
    B(0.02, 0.02, 3.96, 3.96, 3, 6, marble)
    B(0.05, 0.05, 3.9, 3.9, 3.6, 4.4, lobby)
    for i in range(30):
        B(0.05 + 3.9 * i / 29 - 0.015, 3.93, 0.03, 0.04, 3, 6, marble)
        B(3.93, 0.05 + 3.9 * i / 29 - 0.015, 0.04, 0.03, 3, 6, marble)
    B(0.0, 0.0, 4.0, 4.0, 8.4, 0.6, marble)

    def wing(v):
        B(0.1, v, 3.8, 1.6, 9, 10, marble)
        B(0.12, v - 0.005, 3.76, 1.61, 11, 6, glass)
        B(0.095, v + 0.02, 3.81, 1.56, 11, 6, glass)
        for i in range(39):
            B(0.1 + 3.8 * i / 38 - 0.008, v + 1.6 - 0.004, 0.016, 0.016, 11, 6, marble)
        for i in range(17):
            B(3.9 - 0.004, v + 1.6 * i / 16 - 0.008, 0.016, 0.016, 11, 6, marble)
        B(0.08, v - 0.02, 3.84, 1.64, 19, 0.6, marble)
        B(0.3, v + 0.4, 0.4, 0.3, 19.6, 2.5, roofm)
        B(3.2, v + 0.9, 0.3, 0.4, 19.6, 2.5, roofm)

    wing(0.1)
    wing(2.3)
    # Secretariat slab: glass faces front and back, marble end walls.
    u, v, w, d, z, h = 1.0, 1.7, 2.0, 0.6, 9, 96
    B(u, v, w, d, z, h, marble)
    B(u + 0.04, v - 0.008, w - 0.08, d + 0.016, z + 0.5, h * 0.92, glass)
    for i in range(1, 24):
        B(u + w * i / 24 - 0.005, v + d + 0.004, 0.01, 0.01, z, h * 0.93, mull)
    for f in range(1, 37):
        B(u + 0.04, v + d + 0.005, w - 0.08, 0.008, z + h * (f / 37 * 0.91 + 0.02), 0.4, mat("#3c5b5b", 0.4, grain=0))
    for t in (0.3, 0.62):
        B(u + 0.03, v - 0.01, w - 0.06, d + 0.02, z + h * t, h * 0.02, mat("#26393a", 0.7, grain=0))
    # Grille crown.
    for i in range(30):
        B(u + 0.04 + (w - 0.08) * i / 29 - 0.008, v + d, 0.016, 0.012, z + h * 0.935, h * 0.06, mat("#6a7577", 0.5, metal=0.5, grain=0))
    B(1.6, 1.85, 0.8, 0.3, z + h, 4, roofm)
    B(u - 0.01, v - 0.01, w + 0.02, d + 0.02, z + h, 0.8, marble)
    # Entrance canopy.
    B(1.55, 3.86, 0.9, 0.14, 8, 1.2, mat("#f4f2ec", 0.5, grain=0))
    render("worldbank", (5, 5), 110 * S)


MODELS = {
    "capital-usa": white_house,
    "capital-russia": kremlin,
    "capital-china": zhongnanhai,
    "capital-europe": eu,
    "capital-islamic": grand_mosque,
    "worldbank": worldbank,
}

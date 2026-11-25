"""The five faction capitals and the Global Monitoring Center (World Bank).

Each landmark is laid out in the 4-unit art space of its old vector art and scaled by S = 1.25 (u, v and height) to
fill its real plot (5 × 5, the White House 5 × 3), so the flag poles and animated parts in the TS files keep their
coordinates × S.
"""
import math

import bmesh

from kit import _obj, box, cylinder, dome, lathe, mat, render, rod, roof, zp, prism
from models._ruin import apply as ruin

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


# ================================================================ EU headquarters


def eu(damage=0):
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
    ruin(damage, dict(
        ground=3.75, top=118, seed=31, split=2.85,
        blocks=[("box", 0.025, 0.025, 4.975, 0.775, 30.75), ("box", 0.025, 0.775, 1.15, 4.975, 30.75), ("box", 1.15, 0.775, 3.85, 4.975, 15),
                ("box", 3.85, 0.775, 4.975, 4.975, 30.75), ("cyl", 2.5, 1.5625, 0.8, 116), ("cyl", 2.5, 3.3125, 1.07, 47.5)],
        frags=[(0.45, 4.6, 0.3, 26), (4.6, 0.45, 0.28, 24), (2.05, 1.25, 0.35, 46), (1.0, 3.6, 0.25, 14)],
        mount=(2.5, 1.5625, RUIN_POLE_Z["europe"], core), mount2=None, glassy=True,
        debris=[frame, core, core, glass, steel], glass=[glass, glass2], slab=core), 5, 5)
    render("capital-europe" + (f"-d{damage}" if damage else ""), (5, 5), 94 * S)


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


def grand_mosque(damage=0):
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
    ruin(damage, dict(
        ground=3.75, top=146, seed=41, split=2.9, drop=[(2.5, 1.375, 1.2)],
        blocks=[("box", 0.025, 0.025, 0.9, 2.875, 31.75), ("box", 0.9, 0.025, 4.1, 2.56, 44), ("cyl", 2.5, 1.375, 1.14, 116),
                ("box", 4.1, 0.025, 4.975, 2.875, 31.75), ("box", 0.025, 2.875, 1.44, 4.975, 31.75), ("box", 1.44, 2.44, 3.56, 3.19, 73.75),
                ("box", 1.44, 3.19, 3.56, 4.975, 27.5), ("box", 3.56, 2.875, 4.975, 4.975, 31.75),
                ("cyl", 1.625, 2.81, 0.17, 144), ("cyl", 3.375, 2.81, 0.17, 144)],
        frags=[(1.625, 2.81, 0.16, 42), (1.6, 3.15, 0.25, 32), (4.7, 0.3, 0.25, 22), (0.25, 4.75, 0.25, 20)],
        mount=(2.5, 1.375, RUIN_POLE_Z["islamic"], M["stone"]), mount2=None,
        debris=[M["sand"], M["sand"], M["stone"], M["tile"], M["tile_d"], M["cream"]], glass=[], slab=M["stone"]), 5, 5)
    render("capital-islamic" + (f"-d{damage}" if damage else ""), (5, 5), 115 * S)


# ================================================================ Global Monitoring Center


def worldbank(damage=0):
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
    ruin(damage, dict(
        ground=3.75, top=138, seed=51, split=2.9,
        blocks=[("box", 0.025, 0.025, 4.975, 4.975, 11.25), ("box", 0.125, 0.125, 4.875, 2.125, 27.6), ("box", 0.125, 2.875, 4.875, 4.875, 27.6),
                ("box", 1.25, 2.125, 3.75, 2.875, 136)],
        frags=[(1.55, 2.55, 0.3, 56), (4.6, 4.6, 0.25, 22), (0.4, 4.6, 0.22, 18), (4.6, 0.4, 0.22, 16)],
        mount=(2.5, 2.5, RUIN_POLE_Z["worldbank"], marble), mount2=None, glassy=True,
        debris=[marble, marble, roofm, plaza, glass], glass=[], slab=marble), 5, 5)
    render("worldbank" + (f"-d{damage}" if damage else ""), (5, 5), 110 * S)


# Art px: top of the masonry block each flag pole stands on at damage stage 3 (the TS arts' RUIN_POLE_Z).
RUIN_POLE_Z = {"europe": 14.0, "islamic": 14.0, "worldbank": 16.0}

MODELS = {
    "capital-europe": eu,
    "capital-islamic": grand_mosque,
    "worldbank": worldbank,
}
for _k, _f in list(MODELS.items()):
    for _d in (1, 2, 3):
        MODELS[f"{_k}-d{_d}"] = (lambda f=_f, d=_d: f(d))

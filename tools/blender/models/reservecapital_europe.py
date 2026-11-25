"""Conquistalia Reserve Capital (3 x 4): a palace in the manner of Buckingham Palace's east front.

A quadrangle of pale Portland-stone wings round an inner courtyard, filling the plot. The long front wing (+u, along
the 4-cell length v) is the showpiece: a rusticated ground floor with arched openings, two upper floors framed by
giant pilasters, slightly projecting end pavilions and a centre pavilion with six engaged columns under a triangular
pediment, the royal balcony over the centre arch, a cornice and an attic balustrade with urns all along. Behind the
balustrades every wing carries a low lead hip roof with standing seams, hip and ridge rolls and skylight lanterns
(detail on every roof face). Team colour (TEAM["europe"]): the band over the ground floor, the balcony drape and the
tympanum of the pediment.

Plot: u 0..3 (front +u), v 0..4. Own geometry only (kit primitives and materials).
"""
import math

import bmesh

from kit import _obj, box, cylinder, lathe, mat, render, rod, roof, windows, zp, TEAM
from models._damage import ruined_render

W, D = 3, 4
ZS = 32 / 0.866 / 1.35 * 0.7071


def arch_u(u, v, z, w, h, material):
    """Round-headed opening on a +u face at u (v-z plate)."""
    pts = [(v - w / 2, z), (v + w / 2, z), (v + w / 2, z + h)]
    for k in range(1, 10):
        a = k * math.pi / 10
        pts.append((v + (w / 2) * math.cos(a), z + h + (w / 2) * math.sin(a) * ZS))
    pts.append((v - w / 2, z + h))
    bm = bmesh.new()
    bm.faces.new([bm.verts.new((u, vv, zp(zz))) for vv, zz in pts])
    _obj("arch", bm, material)


def lead_roof(u0, v0, w, d, z, h, lead, roll, glass, ridge):
    """Low hip roof of lead sheet behind the balustrade: standing seams on all four faces, hip and ridge rolls."""
    roof(u0, v0, w, d, z, h, lead, kind="hip", ridge=ridge, overhang=0.0)
    a0, a1, b0, b1 = u0, u0 + w, v0, v0 + d
    half = min(w, d) / 2
    if ridge == "v":
        n = max(4, round(d / 0.12))
        for k in range(1, n):
            vv = b0 + d * k / n
            ev = min(vv - b0, b1 - vv)
            for edge, sg in ((a1, -1), (a0, 1)):
                m = min(ev, half)
                rod((edge, vv, zp(z)), (edge + sg * m, vv, zp(z + h * m / half)), 0.005, roll)
        n = max(3, round(w / 0.12))
        for k in range(1, n):
            uu = a0 + w * k / n
            eu = min(uu - a0, a1 - uu)
            for edge, sg in ((b1, -1), (b0, 1)):
                rod((uu, edge, zp(z)), (uu, edge + sg * eu, zp(z + h * eu / half)), 0.005, roll)
        r0, r1 = (a0 + half, b0 + half), (a0 + half, b1 - half)
    else:
        n = max(4, round(w / 0.12))
        for k in range(1, n):
            uu = a0 + w * k / n
            eu = min(uu - a0, a1 - uu)
            for edge, sg in ((b1, -1), (b0, 1)):
                m = min(eu, half)
                rod((uu, edge, zp(z)), (uu, edge + sg * m, zp(z + h * m / half)), 0.005, roll)
        n = max(3, round(d / 0.12))
        for k in range(1, n):
            vv = b0 + d * k / n
            ev = min(vv - b0, b1 - vv)
            for edge, sg in ((a1, -1), (a0, 1)):
                rod((edge, vv, zp(z)), (edge + sg * ev, vv, zp(z + h * ev / half)), 0.005, roll)
        r0, r1 = (a0 + half, b0 + half), (a1 - half, b0 + half)
    top = zp(z + h + 0.2)
    rod((r0[0], r0[1], top), (r1[0], r1[1], top), 0.012, roll)
    for (cu, cv), r in (((a0, b0), r0), ((a1, b0), r0 if ridge == "v" else r1), ((a0, b1), r1 if ridge == "v" else r0), ((a1, b1), r1)):
        rod((cu, cv, zp(z + 0.2)), (r[0], r[1], top), 0.01, roll)
    # Skylight lanterns along the ridge.
    k = 3
    for i in range(k):
        t = (i + 0.5) / k
        cu, cv = r0[0] + (r1[0] - r0[0]) * t, r0[1] + (r1[1] - r0[1]) * t
        box(cu - 0.07, cv - 0.07, 0.14, 0.14, z + h - 1.5, 2.6, glass)
        roof(cu - 0.08, cv - 0.08, 0.16, 0.16, z + h + 1.1, 1.0, lead, kind="pyramid", overhang=0.0)


def balustrade(u0, v0, u1, v1, z, stone, stone_d, urns=True):
    """Attic balustrade along a straight line: base rail, balusters, top rail, urns on the piers."""
    L = math.hypot(u1 - u0, v1 - v0)
    du, dv = (u1 - u0) / L, (v1 - v0) / L
    t = 0.05
    box(min(u0, u1) - (t / 2 if dv else 0), min(v0, v1) - (t / 2 if du else 0), abs(u1 - u0) or t, abs(v1 - v0) or t, z, 0.5, stone_d)
    box(min(u0, u1) - (t / 2 if dv else 0), min(v0, v1) - (t / 2 if du else 0), abs(u1 - u0) or t, abs(v1 - v0) or t, z + 2.2, 0.5, stone)
    n = max(2, round(L / 0.045))
    for k in range(n + 1):
        s = L * k / n
        cylinder(u0 + du * s, v0 + dv * s, 0.011, z + 0.5, 1.7, stone, 6)
    piers = max(1, round(L / 0.45))
    for k in range(piers + 1):
        s = L * k / piers
        pu, pv = u0 + du * s, v0 + dv * s
        box(pu - 0.03, pv - 0.03, 0.06, 0.06, z, 2.9, stone_d)
        if urns:
            lathe(pu, pv, z + 2.9, [(0.015, 0), (0.03, 0.6), (0.026, 1.4), (0.012, 1.8), (0.018, 2.1), (0.0, 2.6)], stone, segs=10)


def wing(u0, v0, w, d, z, h, stone, stone_d, glass, frame, cols_u, cols_v):
    """Plain service wing of the quadrangle: stone walls, two rows of sash windows, cornice."""
    box(u0, v0, w, d, z, h, stone)
    windows("right", u0, v0, w, d, z, h, cols_v, 3, glass, frame, margin=0.07, fill=0.45)
    windows("left", u0, v0, w, d, z, h, cols_u, 3, glass, frame, margin=0.07, fill=0.45)
    box(u0 - 0.02, v0 - 0.02, w + 0.04, d + 0.04, z + h, 1.0, stone_d)


def reserve_capital_europe(damage=0):
    team = mat(TEAM["europe"], 0.5, grain=0)
    stone = mat("#e3ddcd", 0.75, grain=0.07, scale=24)  # Portland stone
    stone_d = mat("#cbc3b0", 0.8, grain=0.09, scale=24)
    rust = mat("#d2cab7", 0.8, grain=0.1, scale=24)
    groove = mat("#a9a08c", 0.85, grain=0)
    lead = mat("#5d666a", 0.55, metal=0.35, grain=0.08, scale=40)
    roll = mat("#4a5256", 0.45, metal=0.45, grain=0)
    glass = mat("#34475a", 0.08, grain=0, glass=True)
    frame = mat("#f3efe6", 0.6, grain=0)
    gravel = mat("#b9ab8f", 0.95, grain=0.2, scale=60)
    gold = mat("#d4af4f", 0.3, metal=0.9, grain=0)
    dark = mat("#2d2622", 0.7, grain=0)

    box(0, 0, W, D, 0, 1, gravel)  # forecourt and courtyard gravel (sunk flush by kit.render)
    H = 22  # cornice height of the wings
    # Quadrangle: back wing, two side wings, front wing (the east front).
    wing(0.12, 0.12, 0.6, 3.76, 1, H, stone, stone_d, glass, frame, 2, 10)
    wing(0.72, 0.12, 1.3, 0.55, 1, H, stone, stone_d, glass, frame, 4, 2)
    wing(0.72, 3.33, 1.3, 0.55, 1, H, stone, stone_d, glass, frame, 4, 2)
    fu0, fw = 2.02, 0.8
    fv0, fd = 0.1, 3.8
    box(fu0, fv0, fw, fd, 1, H, stone)
    face = fu0 + fw

    # Ground floor: rusticated, arched windows and three central arches; team band above it.
    for k in range(1, 4):
        box(face, fv0, 0.01, fd, 1 + k * 2, 0.3, groove)
    cv = fv0 + fd / 2
    for k in range(15):
        vv = fv0 + 0.18 + k * (fd - 0.36) / 14
        if abs(vv - cv) > 0.32:
            arch_u(face + 0.012, vv, 2, 0.11, 3.2, glass)
    for dv in (-0.2, 0, 0.2):
        arch_u(face + 0.012, cv + dv, 1, 0.14, 4.0, dark)
    box(face - 0.01, fv0, 0.03, fd, 8, 0.8, stone_d)
    box(face + 0.02, fv0, 0.012, fd, 8.15, 0.5, team)
    # Upper floors: giant pilasters and two rows of tall windows with pediments.
    for k in range(15):
        vv = fv0 + 0.18 + k * (fd - 0.36) / 14
        if abs(vv - cv) > 0.32:
            box(face + 0.001, vv - 0.045, 0.012, 0.09, 10, 4.2, glass)
            box(face + 0.001, vv - 0.055, 0.02, 0.11, 14.2, 0.6, frame)
            box(face + 0.001, vv - 0.04, 0.012, 0.08, 16, 3.2, glass)
            box(face + 0.001, vv - 0.05, 0.02, 0.1, 19.2, 0.4, frame)
    for k in range(16):
        vv = fv0 + 0.06 + k * (fd - 0.12) / 15
        box(face, vv - 0.018, 0.025, 0.036, 8.8, H - 8.8, stone_d)
        box(face, vv - 0.025, 0.035, 0.05, H - 1.4, 0.8, stone)  # capitals
    # End pavilions project a little and rise to a parapet.
    for pv in (fv0, fv0 + fd - 0.55):
        box(face, pv, 0.06, 0.55, 1, H + 1, stone)
        for k in range(1, 4):
            box(face + 0.06, pv, 0.01, 0.55, 1 + k * 2, 0.3, groove)
        for dv in (0.14, 0.41):
            box(face + 0.061, pv + dv - 0.045, 0.012, 0.09, 10, 4.2, glass)
            box(face + 0.061, pv + dv - 0.04, 0.012, 0.08, 16, 3.2, glass)
        box(face + 0.06, pv, 0.012, 0.55, 8.15, 0.5, team)
    # Cornice along the whole front.
    box(face - 0.02, fv0 - 0.02, 0.1, fd + 0.04, H, 1.2, stone_d)

    # Centre pavilion: six engaged columns over the ground floor, pediment with a team tympanum, royal balcony.
    pv0, pd = cv - 0.42, 0.84
    box(face, pv0, 0.08, pd, 1, H + 1, stone)
    for k in range(6):
        vv = pv0 + 0.07 + k * (pd - 0.14) / 5
        cylinder(face + 0.1, vv, 0.03, 8.8, H - 9.8, frame, 12)
        box(face + 0.07, vv - 0.04, 0.06, 0.08, H - 1.2, 0.9, stone)
    box(face, pv0 - 0.02, 0.14, pd + 0.04, H, 1.4, stone_d)
    bm = bmesh.new()
    tri = [(pv0, H + 1.4), (pv0 + pd, H + 1.4), (cv, H + 7.5)]
    bm.faces.new([bm.verts.new((face + 0.14, vv, zp(zz))) for vv, zz in tri])
    _obj("pediment", bm, stone)
    bm = bmesh.new()
    tri = [(pv0 + 0.1, H + 2.0), (pv0 + pd - 0.1, H + 2.0), (cv, H + 6.4)]
    bm.faces.new([bm.verts.new((face + 0.145, vv, zp(zz))) for vv, zz in tri])
    _obj("tympanum", bm, team)
    roof(face - 0.2, pv0 - 0.02, 0.34, pd + 0.04, H + 1.4, 6.1, lead, kind="gable", ridge="u", overhang=0.0)
    box(face + 0.15, cv - 0.04, 0.008, 0.08, H + 3, 2, gold)  # royal arms
    # Balcony over the centre arch, with a team drape.
    box(face + 0.08, cv - 0.3, 0.16, 0.6, 9, 0.6, stone_d)
    balustrade(face + 0.22, cv - 0.3, face + 0.22, cv + 0.3, 9.6, stone, stone_d, urns=False)
    box(face + 0.23, cv - 0.22, 0.008, 0.44, 8.6, 1.2, team)

    # Attic balustrade with urns round the top of every wing; lead hip roofs behind it.
    zb = H + 1.2
    balustrade(face + 0.06, fv0, face + 0.06, fv0 + fd, zb, stone, stone_d)
    balustrade(fu0, fv0 + fd, face, fv0 + fd, zb, stone, stone_d)
    balustrade(0.12, 3.88, fu0, 3.88, zb, stone, stone_d)
    balustrade(0.72, 0.67, fu0, 0.67, zb, stone, stone_d, urns=False)
    balustrade(0.72, 3.33, fu0, 3.33, zb, stone, stone_d, urns=False)
    lead_roof(fu0 + 0.08, fv0 + 0.08, fw - 0.16, fd - 0.16, zb, 5, lead, roll, glass, "v")
    lead_roof(0.18, 0.18, 0.48, 3.64, zb, 4, lead, roll, glass, "v")
    lead_roof(0.78, 0.18, 1.18, 0.43, zb, 3, lead, roll, glass, "u")
    lead_roof(0.78, 3.39, 1.18, 0.43, zb, 3, lead, roll, glass, "u")
    # Chimney stacks on the back wing.
    for vv in (0.8, 2.0, 3.2):
        box(0.36, vv - 0.1, 0.12, 0.2, zb + 2, 4.5, stone_d)
        box(0.35, vv - 0.11, 0.14, 0.22, zb + 6.5, 0.6, stone)
    # Courtyard: paving cross paths.
    box(0.75, 1.95, 1.25, 0.1, 1, 0.3, stone_d)
    box(1.33, 0.7, 0.1, 2.6, 1, 0.3, stone_d)

    ruined_render("reservecapital-europe", (W, D), 42, damage, seed=14, cut_u=1.5)


MODELS = {"reservecapital-europe": reserve_capital_europe, **{f"reservecapital-europe-d{d}": (lambda d=d: reserve_capital_europe(d)) for d in (1, 2, 3)}}

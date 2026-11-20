"""Paxamerica Reserve Capital (3 x 4): a white neoclassical capitol in the manner of the United States Capitol.

A long white marble building along the 4-cell length v, front on +u: a raised rusticated basement, a central block
with a deep Corinthian portico and pediment over broad steps, connecting ranges with pilasters, and a wing at each
end with its own smaller portico and pediment. A balustrade runs round the top of every range; behind it low copper
hip roofs with standing seams, hip and ridge rolls and skylights (detail on every face). In the middle rises the
great dome: a colonnaded drum (peristyle) with an attic, a ribbed cast-iron dome with rows of windows, a columned
lantern and a bronze statue on top. Team colour (TEAM["usa"]): the band on the basement, the tympana and the ring
under the lantern.

Plot: u 0..3 (front +u), v 0..4. Own geometry only (kit primitives and materials).
"""
import math

import bmesh

from kit import _obj, box, cylinder, lathe, mat, render, rod, roof, windows, zp, TEAM

W, D = 3, 4


def copper_roof(u0, v0, w, d, z, h, sheet, roll, glass, ridge):
    """Low hip roof with standing seams on all four faces, hip and ridge rolls and two skylights."""
    roof(u0, v0, w, d, z, h, sheet, kind="hip", ridge=ridge, overhang=0.0)
    a0, a1, b0, b1 = u0, u0 + w, v0, v0 + d
    half = min(w, d) / 2
    long_v = ridge == "v"
    n_long = max(2, round((d if long_v else w) / 0.09))
    n_short = max(2, round((w if long_v else d) / 0.09))
    for k in range(1, n_long):
        s = k / n_long
        if long_v:
            vv = b0 + d * s
            e = min(vv - b0, b1 - vv, half)
            for edge, sg in ((a1, -1), (a0, 1)):
                rod((edge, vv, zp(z)), (edge + sg * e, vv, zp(z + h * e / half)), 0.005, roll)
        else:
            uu = a0 + w * s
            e = min(uu - a0, a1 - uu, half)
            for edge, sg in ((b1, -1), (b0, 1)):
                rod((uu, edge, zp(z)), (uu, edge + sg * e, zp(z + h * e / half)), 0.005, roll)
    for k in range(1, n_short):
        s = k / n_short
        if long_v:
            uu = a0 + w * s
            e = min(uu - a0, a1 - uu)
            for edge, sg in ((b1, -1), (b0, 1)):
                rod((uu, edge, zp(z)), (uu, edge + sg * e, zp(z + h * e / half)), 0.005, roll)
        else:
            vv = b0 + d * s
            e = min(vv - b0, b1 - vv)
            for edge, sg in ((a1, -1), (a0, 1)):
                rod((edge, vv, zp(z)), (edge + sg * e, vv, zp(z + h * e / half)), 0.005, roll)
    r0 = (a0 + half, b0 + half)
    r1 = (a0 + half, b1 - half) if long_v else (a1 - half, b0 + half)
    top = zp(z + h + 0.2)
    rod((r0[0], r0[1], top), (r1[0], r1[1], top), 0.011, roll)
    for c, r in (((a0, b0), r0), ((a1, b0), r0 if long_v else r1), ((a0, b1), r1 if long_v else r0), ((a1, b1), r1)):
        rod((c[0], c[1], zp(z + 0.2)), (r[0], r[1], top), 0.009, roll)
    for t in (0.3, 0.7):
        cu, cv = r0[0] + (r1[0] - r0[0]) * t, r0[1] + (r1[1] - r0[1]) * t
        box(cu - 0.06, cv - 0.06, 0.12, 0.12, z + h - 1.2, 2.0, glass)


def balustrade(u0, v0, u1, v1, z, marble, marble_d, ends=True):
    """Roof balustrade on a straight run: rails, balusters, piers."""
    L = math.hypot(u1 - u0, v1 - v0)
    du, dv = (u1 - u0) / L, (v1 - v0) / L
    lo_u, lo_v = min(u0, u1) - (0.02 if dv else 0), min(v0, v1) - (0.02 if du else 0)
    sw, sd = abs(u1 - u0) or 0.04, abs(v1 - v0) or 0.04
    box(lo_u, lo_v, sw, sd, z, 0.4, marble_d)
    box(lo_u, lo_v, sw, sd, z + 1.9, 0.4, marble)
    n = max(2, round(L / 0.045))
    for k in range(n + 1):
        cylinder(u0 + du * L * k / n, v0 + dv * L * k / n, 0.01, z + 0.4, 1.5, marble, 6)
    piers = max(1, round(L / 0.4))
    for k in range(piers + 1):
        if not ends and k in (0, piers):
            continue  # the corner pier belongs to the neighbouring run (no doubled faces)
        s = L * k / piers
        box(u0 + du * s - 0.025, v0 + dv * s - 0.025, 0.05, 0.05, z, 2.5, marble_d)


def portico(face, cv, width, depth, z, col_h, ncols, marble, marble_d, team, sheet, steps=0):
    """Projecting Corinthian portico on the +u face at `face`: steps, columns, entablature, pediment with a team tympanum."""
    for k in range(steps):
        box(face + depth + k * 0.07, cv - width / 2 - 0.05, 0.07, width + 0.1, z - 1 - k * 0.9, 0.9, marble_d)
    box(face, cv - width / 2, depth, width, z - 1, 1.0, marble_d)
    for k in range(ncols):
        vv = cv - width / 2 + 0.05 + k * (width - 0.1) / (ncols - 1)
        cylinder(face + depth - 0.05, vv, 0.03, z, col_h, marble, 12)
        cylinder(face + depth - 0.05, vv, 0.042, z + col_h, 0.8, marble, 12)
    ez = z + col_h + 0.8
    box(face, cv - width / 2 - 0.02, depth + 0.02, width + 0.04, ez, 1.6, marble_d)
    ph = width * 3.2
    roof(face, cv - width / 2 - 0.02, depth + 0.02, width + 0.04, ez + 1.6, ph, sheet, kind="gable", ridge="u", overhang=0.0)
    bm = bmesh.new()
    tri = [(cv - width / 2 - 0.02, ez + 1.6), (cv + width / 2 + 0.02, ez + 1.6), (cv, ez + 1.6 + ph)]
    bm.faces.new([bm.verts.new((face + depth + 0.021, vv, zp(zz))) for vv, zz in tri])
    _obj("pediment", bm, marble)
    bm = bmesh.new()
    inset = 0.08
    tri = [(cv - width / 2 + inset, ez + 2.2), (cv + width / 2 - inset, ez + 2.2), (cv, ez + 1.6 + ph - 0.9)]
    bm.faces.new([bm.verts.new((face + depth + 0.026, vv, zp(zz))) for vv, zz in tri])
    _obj("tympanum", bm, team)


def range_block(u0, v0, w, d, z, h, marble, marble_d, glass, frame, cols_v, cols_u):
    """A marble range: windows in two rows, pilasters on the front, cornice."""
    box(u0, v0, w, d, z, h, marble)
    windows("right", u0, v0, w, d, z, h, cols_v, 2, glass, frame, margin=0.08, fill=0.4)
    windows("left", u0, v0, w, d, z, h, cols_u, 2, glass, frame, margin=0.1, fill=0.4)
    for k in range(cols_v + 1):
        box(u0 + w, v0 + 0.03 + k * (d - 0.06) / cols_v - 0.014, 0.02, 0.028, z, h, marble_d)
    box(u0 - 0.025, v0 - 0.025, w + 0.05, d + 0.05, z + h, 1.1, marble_d)


def reserve_capital_usa():
    team = mat(TEAM["usa"], 0.5, grain=0)
    marble = mat("#f1eee6", 0.6, grain=0.05, scale=24)
    marble_d = mat("#d9d4c8", 0.7, grain=0.07, scale=24)
    rust = mat("#cfc9bb", 0.8, grain=0.1, scale=24)
    copper = mat("#5d8f80", 0.55, metal=0.3, grain=0.08, scale=40)
    roll = mat("#4a7568", 0.5, metal=0.35, grain=0)
    glass = mat("#34475a", 0.08, grain=0, glass=True)
    frame = mat("#fbf9f4", 0.55, grain=0)
    iron = mat("#ece9e1", 0.45, metal=0.2, grain=0.03)  # painted cast-iron dome
    bronze = mat("#5a4a34", 0.4, metal=0.8, grain=0.05)
    plaza = mat("#c8c2b4", 0.9, grain=0.1)

    box(0, 0, W, D, 0, 1, plaza)  # plaza (sunk flush by kit.render)
    # Rusticated basement under the whole building, team band on top.
    bu0, bw = 0.35, 2.3
    box(bu0, 0.1, bw, 3.8, 1, 4, rust)
    for k in (2, 3.4):
        box(bu0 + bw, 0.1, 0.01, 3.8, k, 0.25, marble_d)
        box(bu0, 3.9, bw, 0.01, k, 0.25, marble_d)
    box(bu0 + bw + 0.012, 0.1, 0.012, 3.8, 4.3, 0.6, team)
    box(bu0, 3.912, bw, 0.012, 4.3, 0.6, team)
    z0 = 5
    H = 14

    # Central block, connecting ranges, end wings with their own porticoes, main portico.
    cv = 2.0
    range_block(0.45, 1.25, 1.75, 1.5, z0, H, marble, marble_d, glass, frame, 5, 4)
    range_block(0.5, 0.75, 1.55, 0.5, z0, H, marble, marble_d, glass, frame, 2, 4)
    range_block(0.5, 2.75, 1.55, 0.5, z0, H, marble, marble_d, glass, frame, 2, 4)
    for wv in (0.12, 3.18):
        range_block(0.4, wv, 2.15, 0.7, z0, H, marble, marble_d, glass, frame, 3, 6)
        portico(2.55, wv + 0.35, 0.5, 0.1, z0, H - 1.0, 4, marble, marble_d, team, copper)
    portico(2.2, cv, 0.95, 0.35, z0, H - 1.0, 8, marble, marble_d, team, copper, steps=4)

    # Balustrades and copper roofs on every range.
    zb = z0 + H + 1.1
    for u0_, v0_, w_, d_ in ((0.45, 1.25, 1.75, 1.5), (0.5, 0.75, 1.55, 0.5), (0.5, 2.75, 1.55, 0.5), (0.4, 0.12, 2.15, 0.7), (0.4, 3.18, 2.15, 0.7)):
        # Balustrade on all four sides, and every roof at the same pitch (rise in proportion to its span).
        for i_, (a_, b_) in enumerate((((u0_ + w_, v0_), (u0_ + w_, v0_ + d_)), ((u0_, v0_ + d_), (u0_ + w_, v0_ + d_)), ((u0_, v0_), (u0_, v0_ + d_)), ((u0_, v0_), (u0_ + w_, v0_)))):
            balustrade(a_[0], a_[1], b_[0], b_[1], zb, marble, marble_d, ends=i_ < 2)
        span = min(w_, d_) - 0.12
        copper_roof(u0_ + 0.06, v0_ + 0.06, w_ - 0.12, d_ - 0.12, zb, span * 9, copper, roll, glass, "u" if w_ > d_ else "v")

    # The great dome: base, peristyle drum, attic, ribbed dome with window rows, lantern, statue.
    du, dv = 1.3, cv
    zd = zb + 1
    lathe(du, dv, zd, [(0.62, 0), (0.62, 3)], marble_d, segs=40, cap_top=True)
    lathe(du, dv, zd + 3, [(0.5, 0), (0.5, 10)], marble, segs=40, cap_top=True)
    for k in range(28):  # peristyle
        a = 2 * math.pi * k / 28
        cylinder(du + 0.57 * math.cos(a), dv + 0.57 * math.sin(a), 0.018, zd + 3, 10, frame, 8)
    lathe(du, dv, zd + 13, [(0.6, 0), (0.6, 1.4)], marble_d, segs=40, cap_top=True)
    for k in range(20):  # windows in the drum behind the columns
        a = 2 * math.pi * (k + 0.5) / 20
        box(du + 0.5 * math.cos(a) - 0.02, dv + 0.5 * math.sin(a) - 0.02, 0.04, 0.04, zd + 6, 4, glass)
    lathe(du, dv, zd + 14.4, [(0.48, 0), (0.48, 4)], marble, segs=40, cap_top=True)  # attic
    for k in range(16):
        a = 2 * math.pi * (k + 0.5) / 16
        box(du + 0.48 * math.cos(a) - 0.015, dv + 0.48 * math.sin(a) - 0.015, 0.03, 0.03, zd + 15.4, 2, glass)
    zr = zd + 18.4
    prof = [(0.46 * math.cos(t * math.pi / 2) ** 0.85, 17 * math.sin(t * math.pi / 2)) for t in (i / 14 for i in range(15))]
    prof[-1] = (0.13, prof[-1][1])
    lathe(du, dv, zr, prof, iron, segs=48, cap_bottom=True)
    for k in range(24):  # ribs
        a = 2 * math.pi * k / 24
        prev = None
        for r, h in prof:
            p = (du + (r + 0.006) * math.cos(a), dv + (r + 0.006) * math.sin(a), zp(zr + h))
            if prev:
                rod(prev, p, 0.006, marble_d)
            prev = p
    for t, n in ((0.3, 24), (0.55, 24), (0.78, 12)):  # window rows in the dome
        r, h = 0.46 * math.cos(t * math.pi / 2) ** 0.85, 17 * math.sin(t * math.pi / 2)
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n
            box(du + (r + 0.004) * math.cos(a) - 0.012, dv + (r + 0.004) * math.sin(a) - 0.012, 0.024, 0.024, zr + h, 1.0, glass)
    zl = zr + 17
    lathe(du, dv, zl, [(0.15, 0), (0.15, 0.8)], team, segs=24, cap_top=True)
    lathe(du, dv, zl + 0.8, [(0.1, 0), (0.1, 4)], glass, segs=24, cap_top=True)
    for k in range(12):
        a = 2 * math.pi * k / 12
        cylinder(du + 0.11 * math.cos(a), dv + 0.11 * math.sin(a), 0.01, zl + 0.8, 4, frame, 6)
    lathe(du, dv, zl + 4.8, [(0.13, 0), (0.1, 1), (0.04, 2.6), (0.0, 3)], iron, segs=24)
    lathe(du, dv, zl + 7.6, [(0.02, 0), (0.025, 2.2), (0.012, 3.4), (0.0, 4)], bronze, segs=10)  # statue

    render("reservecapital-usa", (W, D), 72)


MODELS = {"reservecapital-usa": reserve_capital_usa}

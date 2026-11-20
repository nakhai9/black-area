"""Longoria capital (5 x 5): Zhongnanhai, seen from Chang'an Avenue, with the compound behind.

Front faces +v (the plot's "left" face in the game), as the TS art (BeijingZhongnanhai.ts) expects.
- Xinhuamen (New China Gate) in the middle: a white marble Sumeru plinth with balustrade and steps, a lower storey of
  red columns and red walls with three studded doors, a skirt eave of golden glazed tiles with a white balustrade, an
  upper storey of red lattice windows behind red columns carrying the national emblem, and a double-eaved xieshan
  (hip-and-gable) roof: curved slopes with tile ribs on every face, painted gables, a ridge with chiwen, hip beasts
  and swept-up corners.
- Red compound walls with grey tile copings either side, the two slogan walls (white characters are drawn in the
  game), stone lions and guard boxes on the forecourt (no trees); the flag pole stands on its marble base on the
  centre line (pole and flag drawn in the game).
- Behind the wall: the Nanhai lake with Yingtai island — a small pavilion with its own curved roof, a white bridge —
  and the Qinzheng hall along the back.
Team colour (TEAM["china"]): the bands on the gate plinth and under both eaves, the lake pavilion's beam.

Own geometry only (kit primitives and materials).
"""
import math

import bmesh

from kit import _obj, box, cylinder, lathe, mat, render, rod, windows, zp, TEAM

W, D = 5, 5


def mats():
    return dict(
        red=mat("#8e2a1e", 0.8, grain=0.1, scale=25),
        col=mat("#a83224", 0.6, grain=0.05),
        lattice=mat("#4a150f", 0.8, grain=0),
        tile=mat("#d9962e", 0.35, grain=0.12, scale=60),
        tile_d=mat("#a8681c", 0.4, grain=0.08, scale=60),
        grey=mat("#5d6166", 0.6, grain=0.12, scale=60),
        grey_d=mat("#45484c", 0.6, grain=0.08, scale=60),
        marble=mat("#e4dfd2", 0.7, grain=0.06),
        marble_d=mat("#c2bcae", 0.8, grain=0.1),
        teal=mat("#2f6f6a", 0.6, grain=0.05),
        blue=mat("#2b4f7a", 0.6, grain=0.05),
        gold=mat("#e0b440", 0.3, metal=0.9, grain=0),
        door=mat("#7c1a12", 0.7, grain=0.05),
        emblem=mat("#c8261d", 0.5, grain=0),
        paving=mat("#9a958b", 0.9, grain=0.15, scale=10),
        water=mat("#3f6f7a", 0.12, grain=0.04, scale=8),
        pine=mat("#35603a", 0.9, grain=0.3, scale=25),
        trunk=mat("#5a4030", 0.9, grain=0.1),
        glass=mat("#34475a", 0.08, grain=0, glass=True),
        team=mat(TEAM["china"], 0.45, metal=0.3, grain=0),
    )


# ---------------------------------------------------------------- roofs


def curved_roof(M, u0, v0, w, d, z, rise, over, lift, kind, tile, rib, gable_m=None):
    """Curved glazed roof over (u0, v0, w, d) with its ridge along u.
    kind "hip": hip roof; "xieshan": hip-and-gable (the top third becomes a gable with a painted gable triangle);
    "skirt": a lower-eave ring (hip shape, cut flat at a third of the rise; the storey above covers the middle).
    Tile ribs run down every slope alike; corners swept up by `lift` art px."""
    a0, a1, b0, b1 = u0 - over, u0 + w + over, v0 - over, v0 + d + over
    half = (b1 - b0) / 2  # ridge along u: the slopes span v
    gable_at = half * (0.55 if kind == "xieshan" else 1.0)
    cap = 0.38 if kind == "skirt" else 1.0
    reach = 0.5

    def t_of(u, v):
        eu, ev = min(u - a0, a1 - u), min(v - b0, b1 - v)
        tv = ev / half
        if kind == "xieshan" and eu >= gable_at * 0.999:
            return min(1.0, tv)
        return min(1.0, tv, eu / half)

    def height(u, v):
        eu, ev = min(u - a0, a1 - u), min(v - b0, b1 - v)
        t = max(0.0, min(t_of(u, v), cap))
        eu, ev = max(eu, 0.0), max(ev, 0.0)
        sweep = lift * max(0.0, 1 - eu / reach) ** 2 * max(0.0, 1 - ev / reach) ** 2
        return z + rise * t**1.6 + sweep

    nu, nv = 56, 28
    bm = bmesh.new()
    grid = [[bm.verts.new((a0 + (a1 - a0) * i / nu, b0 + (b1 - b0) * j / nv, 0)) for j in range(nv + 1)] for i in range(nu + 1)]
    for row in grid:
        for vert in row:
            vert.co.z = zp(height(vert.co.x, vert.co.y))
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("roof", bm, tile)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.modifiers.new("solid", "SOLIDIFY").thickness = 0.03

    def rib_line(pts):
        for p, q in zip(pts, pts[1:]):
            rod((p[0], p[1], zp(height(*p) + 0.7)), (q[0], q[1], zp(height(*q) + 0.7)), 0.014, rib)

    # Ribs: front and back slopes (down v), both hip ends (down u), evenly spaced.
    n = max(8, round((a1 - a0) / 0.08))
    for k in range(n):
        u = a0 + 0.08 + k * ((a1 - a0) - 0.16) / (n - 1)
        eu = min(u - a0, a1 - u)
        if kind != "xieshan" or eu < gable_at:
            reach_v = min(eu, half)
        else:
            reach_v = half
        if kind == "skirt":
            reach_v = min(reach_v, half * cap)
        for edge, sg in ((b1, -1), (b0, 1)):
            top = edge + sg * reach_v
            rib_line([(u, top + (edge - top) * s / 6) for s in range(7)])
            box(u - 0.016, edge - 0.015, 0.032, 0.03, height(u, edge - sg * 0.01) - 0.6, 0.9, M["gold"])  # eave caps
    m = max(4, round((b1 - b0) / 0.08))
    for k in range(m):
        v = b0 + 0.08 + k * ((b1 - b0) - 0.16) / (m - 1)
        ev = min(v - b0, b1 - v)
        reach_u = min(ev, gable_at if kind == "xieshan" else half)
        if kind == "skirt":
            reach_u = min(reach_u, half * cap)
        for edge, sg in ((a1, -1), (a0, 1)):
            top = edge + sg * reach_u
            rib_line([(top + (edge - top) * s / 5, v) for s in range(6)])
            box(edge - 0.015, v - 0.016, 0.03, 0.032, height(edge - sg * 0.01, v) - 0.6, 0.9, M["gold"])
    # Eave board along all four edges.
    for bx in ((a0, b0, a1 - a0, 0.03), (a0, b1 - 0.03, a1 - a0, 0.03), (a0, b0, 0.03, b1 - b0), (a1 - 0.03, b0, 0.03, b1 - b0)):
        box(*bx, z - 0.7, 0.8, M["tile_d"])
    if kind == "skirt":
        return
    # Main ridge with chiwen; hip ridges with beasts; gable triangles for xieshan.
    zr = z + rise
    r0, r1 = (a0 + (gable_at if kind == "xieshan" else half), a1 - (gable_at if kind == "xieshan" else half))
    cv = (b0 + b1) / 2
    box(r0 - 0.04, cv - 0.05, r1 - r0 + 0.08, 0.1, zr - 0.4, 2.2, rib)
    box(r0, cv - 0.052, r1 - r0, 0.104, zr + 0.8, 0.4, M["gold"])
    for x, sg in ((r0, -1), (r1, 1)):
        box(x - 0.05, cv - 0.05, 0.1, 0.1, zr + 1.8, 4.0, rib)
        box(x - 0.04 - sg * 0.05, cv - 0.04, 0.08, 0.08, zr + 5.2, 1.6, rib)
        box(x - 0.025 - sg * 0.08, cv - 0.025, 0.05, 0.05, zr + 6.3, 1.0, M["gold"])
    if kind == "xieshan" and gable_m is not None:
        for x in (r0, r1):
            bm = bmesh.new()
            gz = height(x, b0 + half * 0.45)
            pts = [(b0 + half * 0.45, gz), (b1 - half * 0.45, gz), (cv, zr)]
            bm.faces.new([bm.verts.new((x, vv, zp(zz))) for vv, zz in pts])
            _obj("gable", bm, gable_m)
            # Gold studs on the gable (the suspended fish).
            box(x - 0.01, cv - 0.03, 0.02, 0.06, zr - 3.5, 2.5, M["gold"])
    corners = ((a0, b0), (a1, b0), (a0, b1), (a1, b1))
    for (cu, cvv) in corners:
        rx = r0 if cu == a0 else r1
        start = (rx, cv) if kind != "xieshan" else (rx, cvv + (half * 0.45 if cvv == b0 else -half * 0.45))
        prev = None
        for s in range(7):
            t = s / 6
            pu, pv = start[0] + (cu - start[0]) * t * 0.97, start[1] + (cvv - start[1]) * t * 0.97
            p = (pu, pv, zp(height(pu, pv) + 1.0))
            if prev:
                rod(prev, p, 0.022, rib)
            prev = p
        for k in range(3):
            t = 0.62 + k * 0.1
            pu, pv = start[0] + (cu - start[0]) * t, start[1] + (cvv - start[1]) * t
            box(pu - 0.02, pv - 0.02, 0.04, 0.04, height(pu, pv) + 1.4, 1.4, rib)


# ---------------------------------------------------------------- parts


def colonnade_hall(M, u0, v0, w, d, z, h, cols_u, cols_v):
    """Red-walled storey behind a ring of red columns, lattice windows on the two visible faces, painted bracket band."""
    box(u0 + 0.07, v0 + 0.07, w - 0.14, d - 0.14, z, h, M["red"])
    windows("left", u0 + 0.07, v0 + 0.07, w - 0.14, d - 0.14, z, h * 0.8, cols_u, 1, M["lattice"], M["gold"], margin=0.04, fill=0.7)
    windows("right", u0 + 0.07, v0 + 0.07, w - 0.14, d - 0.14, z, h * 0.8, cols_v, 1, M["lattice"], M["gold"], margin=0.05, fill=0.7)
    for i in range(cols_u + 1):
        cu = u0 + 0.04 + (w - 0.08) * i / cols_u
        for cv in (v0 + 0.04, v0 + d - 0.04):
            cylinder(cu, cv, 0.03, z, h * 0.8, M["col"], 10)
    for i in range(1, cols_v):
        cv = v0 + 0.04 + (d - 0.08) * i / cols_v
        for cu in (u0 + 0.04, u0 + w - 0.04):
            cylinder(cu, cv, 0.03, z, h * 0.8, M["col"], 10)
    box(u0, v0, w, d, z + h * 0.8, h * 0.1, M["teal"])
    box(u0 - 0.02, v0 - 0.02, w + 0.04, d + 0.04, z + h * 0.9, h * 0.1, M["blue"])
    box(u0 - 0.025, v0 + d + 0.015, w + 0.05, 0.012, z + h * 0.8, h * 0.06, M["team"])
    box(u0 + w + 0.015, v0 - 0.025, 0.012, d + 0.05, z + h * 0.8, h * 0.06, M["team"])


def balustrade_ring(M, u0, v0, w, d, z, h, step=0.06):
    for (pu, pv, qu, qv) in ((u0, v0, u0 + w, v0), (u0, v0 + d, u0 + w, v0 + d), (u0, v0, u0, v0 + d), (u0 + w, v0, u0 + w, v0 + d)):
        L = math.hypot(qu - pu, qv - pv)
        n = max(2, round(L / step))
        for k in range(n + 1):
            t = k / n
            box(pu + (qu - pu) * t - 0.012, pv + (qv - pv) * t - 0.012, 0.024, 0.024, z, h, M["marble"])
        box(min(pu, qu) - 0.015, min(pv, qv) - 0.015, abs(qu - pu) + 0.03, abs(qv - pv) + 0.03, z + h, 0.5, M["marble"])


def red_wall(M, u0, v0, w, d, h):
    """Compound wall: red, a marble footing, and a grey tile coping with a small ridge."""
    box(u0, v0, w, d, 1, 1.2, M["marble_d"])
    box(u0 + 0.01, v0 + 0.01, w - 0.02, d - 0.02, 2.2, h, M["red"])
    box(u0 - 0.04, v0 - 0.04, w + 0.08, d + 0.08, 2.2 + h, 0.8, M["grey_d"])
    box(u0 - 0.02, v0 - 0.02, w + 0.04, d + 0.04, 3.0 + h, 0.8, M["grey"])
    box(u0, v0 + d / 2 - 0.02, w, 0.04, 3.8 + h, 0.6, M["grey_d"]) if w > d else box(u0 + w / 2 - 0.02, v0, 0.04, d, 3.8 + h, 0.6, M["grey_d"])


def lion(M, cu, cv):
    box(cu - 0.12, cv - 0.08, 0.24, 0.16, 1, 3.2, M["marble_d"])
    box(cu - 0.08, cv - 0.06, 0.16, 0.12, 4.2, 3.5, mat("#8a857c", 0.9, grain=0.15), 0.01)
    lathe(cu, cv + 0.02, 7.7, [(0.065, 0), (0.07, 1.5), (0.04, 3.2), (0.0, 3.6)], mat("#8a857c", 0.9, grain=0.15), segs=12)


# ---------------------------------------------------------------- the model


def capital_china():
    M = mats()
    box(0, 0, W, D, 0, 1, M["paving"])  # plot paving (sunk flush by kit.render)

    # Behind the wall: the Nanhai lake, Yingtai island pavilion and bridge, the Qinzheng hall along the back.
    box(0.15, 0.12, 4.7, 1.55, 1, 0.3, M["marble_d"])
    box(0.2, 0.17, 4.6, 1.45, 1.3, 0.05, M["water"])
    box(0.25, 0.08, 4.5, 0.42, 1, 2, M["marble"])
    colonnade_hall(M, 0.35, 0.1, 4.3, 0.38, 3, 8, 14, 2)
    curved_roof(M, 0.35, 0.1, 4.3, 0.38, 11, 5, 0.1, 1.6, "hip", M["grey"], M["grey_d"])
    box(1.85, 0.7, 1.3, 0.75, 1.3, 2, M["marble"])  # island
    colonnade_hall(M, 2.05, 0.82, 0.9, 0.5, 3.3, 7, 4, 2)
    curved_roof(M, 2.05, 0.82, 0.9, 0.5, 10.3, 6, 0.14, 2.4, "xieshan", M["grey"], M["grey_d"], M["teal"])
    box(2.35, 1.45, 0.3, 0.42, 1.3, 1.2, M["marble"])  # white bridge to the shore
    for k in range(6):
        box(2.35, 1.45 + k * 0.08, 0.02, 0.02, 2.5, 1.2, M["marble"])
        box(2.63, 1.45 + k * 0.08, 0.02, 0.02, 2.5, 1.2, M["marble"])

    # Compound wall along the front of the lake, either side of the gate; slogan walls in front of it.
    red_wall(M, 0.1, 1.85, 1.1, 0.18, 9)
    red_wall(M, 3.8, 1.85, 1.1, 0.18, 9)
    red_wall(M, 0.0, 3.45, 0.62, 0.38, 10)  # slogan walls (old art u 0..0.5, v 2.75..3.05 x 1.25)
    red_wall(M, 4.38, 3.45, 0.62, 0.38, 10)

    # Xinhuamen: plinth, lower storey with three doors, skirt eave with balustrade, upper storey, xieshan roof.
    G0, GW, GV, GD = 1.15, 2.7, 2.0, 1.3
    box(G0 - 0.15, GV - 0.15, GW + 0.3, GD + 0.3, 1, 2.4, M["marble_d"])
    box(G0 - 0.12, GV - 0.12, GW + 0.24, GD + 0.24, 3.4, 0.6, M["marble"])
    box(G0 - 0.151, GV + GD + 0.15, GW + 0.302, 0.012, 2.2, 0.6, M["team"])
    box(G0 + GW + 0.15, GV - 0.151, 0.012, GD + 0.302, 2.2, 0.6, M["team"])
    for k in range(4):  # steps up to the doors
        box(G0 + GW / 2 - 0.6, GV + GD + 0.15 + k * 0.08, 1.2, 0.08, 1, 2.4 - k * 0.6, M["marble"])
    colonnade_hall(M, G0, GV, GW, GD, 4, 14, 9, 4)
    for k, dw in ((-1, 0.3), (0, 0.38), (1, 0.3)):
        cu = G0 + GW / 2 + k * 0.62
        box(cu - dw / 2, GV + GD - 0.07, dw, 0.012, 4, 9.5, M["door"])
        for r in range(1, 6):
            for c in range(1, 5):
                box(cu - dw / 2 + c * dw / 5 - 0.008, GV + GD - 0.06, 0.016, 0.01, 4 + r * 1.55, 0.4, M["gold"])
    curved_roof(M, G0, GV, GW, GD, 18, 6, 0.24, 2.6, "skirt", M["tile"], M["tile_d"])
    U0, UW, UV, UD = G0 + 0.25, GW - 0.5, GV + 0.22, GD - 0.44
    box(U0 - 0.06, UV - 0.06, UW + 0.12, UD + 0.12, 20.2, 0.8, M["marble"])
    balustrade_ring(M, U0 - 0.1, UV - 0.1, UW + 0.2, UD + 0.2, 21, 2.0)
    colonnade_hall(M, U0, UV, UW, UD, 21, 12, 9, 3)
    # National emblem on the upper storey front: gold-ringed red disc with gold stars.
    ez, cu = 28.6, U0 + UW / 2
    box(cu - 0.15, UV + UD + 0.015, 0.3, 0.012, ez, 3.4, M["gold"])
    box(cu - 0.12, UV + UD + 0.028, 0.24, 0.012, ez + 0.4, 2.6, M["emblem"])
    box(cu - 0.03, UV + UD + 0.04, 0.06, 0.008, ez + 1.4, 0.8, M["gold"])
    curved_roof(M, U0, UV, UW, UD, 33, 11, 0.26, 3.0, "xieshan", M["tile"], M["tile_d"], M["teal"])

    # Forecourt: stone lions, guard boxes, flag pole base on the centre line.
    for cu in (G0 + 0.35, G0 + GW - 0.35):
        lion(M, cu, 3.9)
    for cu in (0.85, 4.15):
        box(cu - 0.12, 3.95, 0.24, 0.24, 1, 7, M["marble"])
        box(cu - 0.14, 3.93, 0.28, 0.28, 8, 0.6, M["grey_d"])
        box(cu - 0.06, 4.19, 0.12, 0.01, 2, 4, M["glass"])
    cylinder(2.5, 4.52, 0.22, 1, 1.5, M["marble"], 24)
    balustrade_ring(M, 2.25, 4.27, 0.5, 0.5, 1, 1.8)

    render("capital-china", (W, D), 60)


MODELS = {"capital-china": capital_china}

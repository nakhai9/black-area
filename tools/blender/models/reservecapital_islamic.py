"""Lunastron Reserve Capital (3 x 4): an ordinary government palace, Islamic architecture.

A sandstone block filling the plot round a raised centre: a deep pointed-arch arcade along the front (+u) and +v
side, a tall pishtaq (portal frame) with a muqarnas-dark niche in the middle of the front, a crenellated parapet with
a band of green-blue tilework. On the roof: a large ribbed dome on an octagonal drum with windows, a gold finial
with a crescent, and four small ribbed domes on kiosks (chhatri) at the corners; two slender minaret-like corner
towers at the back. Team colour (TEAM["islamic"]): the tile band under the parapet, the portal frame and the drum band.

Plot: u 0..3 (front +u), v 0..4. Own geometry only (kit primitives and materials).
"""
import math

import bmesh

from kit import _obj, box, cylinder, lathe, mat, render, rod, windows, zp, TEAM
from models._damage import ruined_render

W, D = 3, 4
ZS = 32 / 0.866 / 1.35 * 0.7071  # tiles across → art px up, so arcs read round


def pointed_arch(face, at, c, z, w, h, material):
    """Pointed arch opening (rectangle + two arcs meeting at a point) on the +u face (at = u) or the +v face (at = v)."""
    pts = [(c - w / 2, z), (c + w / 2, z), (c + w / 2, z + h)]
    r = w * 0.85
    for k in range(1, 7):  # right arc up to the apex
        a = math.pi - math.acos(0.5 / 0.85) * (1 - k / 7) - (math.pi - math.acos(-0.0)) * 0
        t = k / 7
        ang = math.acos((w / 2 - (w / 2) * 0) / r) if False else None
        x = c + w / 2 - (w / 2) * (1 - math.cos(t * math.pi / 2))
        y = z + h + (w * 0.75) * math.sin(t * math.pi / 2) * ZS * 0.5
        pts.append((x, y))
    pts.append((c, z + h + w * 0.75 * ZS * 0.62))
    for k in range(6, 0, -1):
        t = k / 7
        x = c - w / 2 + (w / 2) * (1 - math.cos(t * math.pi / 2))
        y = z + h + (w * 0.75) * math.sin(t * math.pi / 2) * ZS * 0.5
        pts.append((x, y))
    pts.append((c - w / 2, z + h))
    bm = bmesh.new()
    if face == "u":
        vs = [bm.verts.new((at, cc, zp(zz))) for cc, zz in pts]
    else:
        vs = [bm.verts.new((cc, at, zp(zz))) for cc, zz in reversed(pts)]
    bm.faces.new(vs)
    _obj("arch", bm, material)


def ribbed_dome(cu, cv, r, z, h, shell, rib, ribs, finial=None):
    """Dome with raised ribs all round (never a bare shell) and an optional gold finial."""
    prof = [(max(r * math.cos(t * math.pi / 2) * (1 + 0.12 * math.sin(t * math.pi)), 0.0005), h * math.sin(t * math.pi / 2)) for t in (i / 12 for i in range(13))]
    lathe(cu, cv, z, prof, shell, segs=40, cap_bottom=True)
    for k in range(ribs):
        a = 2 * math.pi * k / ribs
        prev = None
        for rr, hz in prof:
            p = (cu + (rr + 0.006) * math.cos(a), cv + (rr + 0.006) * math.sin(a), zp(z + hz))
            if prev:
                rod(prev, p, 0.007, rib)
            prev = p
    if finial is not None:
        lathe(cu, cv, z + h, [(0.02, 0), (0.035, 1.0), (0.02, 2.0), (0.025, 2.6), (0.004, 5.0)], finial, segs=12)


def reserve_capital_islamic(damage=0):
    team = mat(TEAM["islamic"], 0.45, grain=0)
    sand = mat("#d9c4a0", 0.8, grain=0.1, scale=22)
    sand_d = mat("#bfa47c", 0.85, grain=0.12, scale=22)
    shade = mat("#3a2e24", 0.8, grain=0)
    tile = mat("#2f7f8a", 0.35, grain=0.05, scale=60)
    dome_m = mat("#e8e1d2", 0.5, grain=0.05)
    rib = mat("#c8a556", 0.35, metal=0.7, grain=0)
    gold = mat("#d4af4f", 0.28, metal=0.9, grain=0)
    glass = mat("#33475a", 0.08, grain=0, glass=True)
    lattice = mat("#e9dfcb", 0.6, grain=0)

    box(0, 0, W, D, 0, 1, sand_d)
    u0, v0, w, d = 0.15, 0.15, 2.7, 3.7
    H = 16
    box(u0, v0, w, d, 1, H, sand)
    # Arcade: pointed arches along the front and the +v side, piers between them.
    for k in range(9):
        c = v0 + 0.25 + k * (d - 0.5) / 8
        if abs(c - (v0 + d / 2)) > 0.45:
            pointed_arch("u", u0 + w + 0.012, c, 1.5, 0.26, 7, shade)
            pointed_arch("u", u0 + w + 0.013, c, 1.5, 0.12, 4.5, glass)
    for k in range(7):
        c = u0 + 0.25 + k * (w - 0.5) / 6
        pointed_arch("v", v0 + d + 0.012, c, 1.5, 0.26, 7, shade)
        pointed_arch("v", v0 + d + 0.013, c, 1.5, 0.12, 4.5, glass)
    windows("right", u0, v0, w, d, 11, 4, 10, 1, lattice, None, margin=0.05, fill=0.35)
    windows("left", u0, v0, w, d, 11, 4, 8, 1, lattice, None, margin=0.05, fill=0.35)
    # Tile band and crenellated parapet.
    box(u0 - 0.01, v0 - 0.01, w + 0.02, d + 0.02, H - 1.2, 1.0, tile)
    box(u0 + w + 0.01, v0, 0.012, d, H - 2.4, 0.9, team)
    box(u0, v0 + d + 0.01, w, 0.012, H - 2.4, 0.9, team)
    box(u0 - 0.03, v0 - 0.03, w + 0.06, d + 0.06, H + 1, 0.8, sand_d)
    for k in range(22):
        vv = v0 + k * d / 21
        box(u0 + w - 0.05, vv - 0.035, 0.08, 0.07, H + 1.8, 1.6, sand_d)
        box(u0 - 0.03, vv - 0.035, 0.08, 0.07, H + 1.8, 1.6, sand_d)
    for k in range(16):
        uu = u0 + k * w / 15
        box(uu - 0.035, v0 + d - 0.05, 0.07, 0.08, H + 1.8, 1.6, sand_d)
        box(uu - 0.035, v0 - 0.03, 0.07, 0.08, H + 1.8, 1.6, sand_d)

    # Pishtaq: tall portal frame in the middle of the front, team frame, dark niche, tile border.
    cv = v0 + d / 2
    box(u0 + w - 0.05, cv - 0.48, 0.18, 0.96, 1, H + 9, sand)
    box(u0 + w + 0.13, cv - 0.44, 0.012, 0.88, 2, H + 6.5, team)
    box(u0 + w + 0.135, cv - 0.38, 0.012, 0.76, 2, H + 5.5, tile)
    pointed_arch("u", u0 + w + 0.15, cv, 1, 0.6, 12, shade)
    pointed_arch("u", u0 + w + 0.152, cv, 1.5, 0.3, 6, mat("#5a3d28", 0.7))
    for k in range(10):  # crenellation on top of the portal
        box(u0 + w - 0.03, cv - 0.45 + k * 0.1, 0.14, 0.05, H + 10, 1.6, sand_d)

    # Central dome on an octagonal drum with windows and team band.
    du, dv = u0 + w / 2 - 0.1, cv
    lathe(du, dv, H + 1, [(0.62, 0), (0.62, 2.5)], sand_d, segs=8, cap_top=True)
    lathe(du, dv, H + 3.5, [(0.55, 0), (0.55, 8)], sand, segs=8, cap_top=True)
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        cu_, cv_ = du + 0.56 * math.cos(a), dv + 0.56 * math.sin(a)
        cylinder(cu_, cv_, 0.05, H + 5, 4.5, glass, 8)
    lathe(du, dv, H + 11.5, [(0.57, 0), (0.57, 1.0)], team, segs=8)
    ribbed_dome(du, dv, 0.52, H + 12.5, 18, dome_m, rib, 16, gold)
    # Roof terrace: paving joints in a grid and a low balustrade round the drum (no bare flat roof).
    joint = mat("#9c8460", 0.85, grain=0)
    for k in range(1, 12):
        vv = v0 + d * k / 12
        box(u0 + 0.05, vv - 0.008, w - 0.1, 0.025, H + 1, 0.5, joint)
    for k in range(1, 9):
        uu = u0 + w * k / 9
        box(uu - 0.008, v0 + 0.05, 0.025, d - 0.1, H + 1, 0.5, joint)
    for k in range(24):
        a = 2 * math.pi * k / 24
        cylinder(du + 0.78 * math.cos(a), dv + 0.78 * math.sin(a), 0.015, H + 1, 1.6, sand_d, 6)
    lathe(du, dv, H + 2.6, [(0.8, 0), (0.8, 0.4), (0.76, 0.4), (0.76, 0)], sand_d, segs=24)
    # Corner kiosks with small ribbed domes on the front corners; slender towers at the back corners.
    for ku, kv in ((u0 + w - 0.35, v0 + 0.35), (u0 + w - 0.35, v0 + d - 0.35)):
        box(ku - 0.2, kv - 0.2, 0.4, 0.4, H + 1, 1.0, sand_d)
        for du_, dv_ in ((-0.15, -0.15), (0.15, -0.15), (0.15, 0.15), (-0.15, 0.15)):
            cylinder(ku + du_, kv + dv_, 0.025, H + 2, 6, sand, 8)
        box(ku - 0.2, kv - 0.2, 0.4, 0.4, H + 8, 1.0, sand_d)
        box(ku - 0.19, kv - 0.19, 0.38, 0.38, H + 7.4, 0.6, tile)
        ribbed_dome(ku, kv, 0.17, H + 9, 6, dome_m, rib, 8, gold)
    for tu, tv in ((u0 + 0.25, v0 + 0.25), (u0 + 0.25, v0 + d - 0.25)):
        lathe(tu, tv, 1, [(0.14, 0), (0.14, H + 6), (0.11, H + 6.5), (0.11, H + 18)], sand, segs=12, cap_top=True)
        for z in (H + 6, H + 12):
            lathe(tu, tv, z, [(0.17, 0), (0.17, 1.0)], sand_d, segs=12, cap_top=True)
            lathe(tu, tv, z - 1.0, [(0.15, 0), (0.15, 0.8)], tile, segs=12)
        ribbed_dome(tu, tv, 0.12, H + 18, 5, dome_m, rib, 8, gold)

    ruined_render("reservecapital-islamic", (W, D), 76, damage, seed=15, cut_u=1.5)


MODELS = {"reservecapital-islamic": reserve_capital_islamic, **{f"reservecapital-islamic-d{d}": (lambda d=d: reserve_capital_islamic(d)) for d in (1, 2, 3)}}

"""Longoria Reserve Capital (3 x 4): the wartime seat of government that takes over when the capital falls.

An ordinary (not fortified) government hall filling the plot: a white stone podium, a terrace with balustrade and
front steps, a hall of red columns and dark timber walls with lattice windows, double eaves of red glazed tiles with
gold eave caps, chiwen, a gold pearl and ridge beasts. Team colour (TEAM["china"]): the band on the podium, the beam
under the eaves and the band on the upper storey.

Plot: u 0..3 (front +u), v 0..4. Height about 56 art px. Own geometry only (kit primitives and materials).
"""
import math

import bmesh

from kit import _obj, box, cylinder, mat, prism, render, rod, windows, zp, TEAM
from models._damage import ruined_render

W, D = 3, 4
BASE_H = 14  # bastion height (art px)


# ---------------------------------------------------------------- local shapes


def battered_block(u0, v0, w, d, z, h, inset, material, top=None):
    """Concrete block whose walls lean in by `inset` tiles from bottom to top (a bastion's battered walls)."""
    bm = bmesh.new()
    lo = [(u0, v0), (u0 + w, v0), (u0 + w, v0 + d), (u0, v0 + d)]
    hi = [(u0 + inset, v0 + inset), (u0 + w - inset, v0 + inset), (u0 + w - inset, v0 + d - inset), (u0 + inset, v0 + d - inset)]
    a = [bm.verts.new((x, y, zp(z))) for x, y in lo]
    b = [bm.verts.new((x, y, zp(z + h))) for x, y in hi]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(a)))
    f = bm.faces.new(b)
    if top is not None:
        f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("bastion", bm, [material, top] if top is not None else material)


def hall_roof(u0, v0, w, d, z, rise, over, lift, tile, tile_dark, eave, gold=None, ornate=True):
    """Curved hip roof of the rooftop hall: concave slopes flaring to the eaves, corners swept up by `lift` art px,
    ridge along the longer side, raised tile ribs on the two visible slopes, hip and main ridges, eave board."""
    a0, a1, b0, b1 = u0 - over, u0 + w + over, v0 - over, v0 + d + over
    half = min(a1 - a0, b1 - b0) / 2
    reach = 0.45

    def height(u, v):
        eu, ev = min(u - a0, a1 - u), min(v - b0, b1 - v)
        t = max(0.0, min(1.0, min(eu, ev) / half))
        sweep = lift * max(0.0, 1 - eu / reach) ** 2 * max(0.0, 1 - ev / reach) ** 2
        return z + rise * t**1.6 + sweep

    n = 40
    bm = bmesh.new()
    grid = []
    for i in range(n + 1):
        row = []
        for j in range(n + 1):
            u = a0 + (a1 - a0) * i / n
            v = b0 + (b1 - b0) * j / n
            row.append(bm.verts.new((u, v, zp(height(u, v)))))
        grid.append(row)
    for i in range(n):
        for j in range(n):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = _obj("hall_roof", bm, tile)
    for p in ob.data.polygons:
        p.use_smooth = True
    sol = ob.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.03

    # Tile ribs on all four slopes alike (front, back and both hips), following the surface, with gold eave caps.
    cu, cv = (a0 + a1) / 2, (b0 + b1) / 2
    rib = lambda a, b: rod((a[0], a[1], zp(height(*a) + 0.75)), (b[0], b[1], zp(height(*b) + 0.75)), 0.017, tile_dark)
    nv = max(8, round((b1 - b0) / 0.085))
    for k in range(nv):
        v = b0 + 0.12 + k * ((b1 - b0) - 0.24) / (nv - 1)
        ev = min(v - b0, b1 - v)
        for edge, sign in ((a1, -1), (a0, 1)):
            top = edge + sign * min(ev, half)
            pts = [(top + (edge - top) * s / 8, v) for s in range(9)]
            for p0, p1 in zip(pts, pts[1:]):
                rib(p0, p1)
            if gold is not None:
                box(edge - 0.015, v - 0.018, 0.03, 0.036, height(edge - sign * 0.01, v) - 0.6, 0.9, gold)
    nu = max(6, round((a1 - a0) / 0.085))
    for k in range(nu):
        u = a0 + 0.12 + k * ((a1 - a0) - 0.24) / (nu - 1)
        eu = min(u - a0, a1 - u)
        for edge, sign in ((b1, -1), (b0, 1)):
            top = edge + sign * min(eu, half)
            pts = [(u, top + (edge - top) * s / 7) for s in range(8)]
            for p0, p1 in zip(pts, pts[1:]):
                rib(p0, p1)
            if gold is not None:
                box(u - 0.018, edge - 0.015, 0.036, 0.03, height(u, edge - sign * 0.01) - 0.6, 0.9, gold)
    if not ornate:
        box(a1 - 0.02, b0, 0.03, b1 - b0, z - 0.6, 0.9, eave)
        box(a0, b1 - 0.02, a1 - a0, 0.03, z - 0.6, 0.9, eave)
        return

    # Main ridge along v with end ornaments (chiwen blocks), and the four hip ridges.
    r0, r1 = (cu, b0 + half), (cu, b1 - half)
    zr = z + rise
    box(cu - 0.07, r0[1] - 0.02, 0.14, r1[1] - r0[1] + 0.04, zr - 0.4, 2.6, tile_dark)
    if gold is not None:
        box(cu - 0.072, r0[1], 0.144, r1[1] - r0[1], zr + 0.9, 0.5, gold)
    # Chiwen: tall end ornaments curling inwards, with a gold tip.
    for vv, inward in ((r0[1] - 0.05, 1), (r1[1] + 0.05, -1)):
        box(cu - 0.06, vv - 0.05, 0.12, 0.1, zr + 2.2, 4.2, tile_dark)
        box(cu - 0.05, vv - 0.05 + inward * 0.06, 0.1, 0.1, zr + 5.6, 1.6, tile_dark)
        if gold is not None:
            box(cu - 0.03, vv - 0.03 + inward * 0.1, 0.06, 0.06, zr + 6.8, 1.0, gold)
    # Gold pearl finial at the middle of the ridge.
    if gold is not None:
        mv = (r0[1] + r1[1]) / 2
        cylinder(cu, mv, 0.03, zr + 2.2, 1.6, gold, 12)
        from kit import dome as _d
        _d(cu, mv, 0.06, zr + 3.8, 3.0, gold, segs=20, rings=8)
    for (ru, rv), (eu, ev) in ((r0, (a0, b0)), (r0, (a1, b0)), (r1, (a0, b1)), (r1, (a1, b1))):
        steps = 6
        prev = None
        for s in range(steps + 1):
            t = s / steps
            pu, pv = ru + (eu - ru) * t * 0.97, rv + (ev - rv) * t * 0.97
            p = (pu, pv, zp(height(pu, pv) + 0.9))
            if prev:
                rod(prev, p, 0.03, tile_dark)
            prev = p
        # Row of ridge beasts near the eave end of each hip.
        if gold is not None:
            for k in range(3):
                t = 0.62 + k * 0.1
                pu, pv = ru + (eu - ru) * t, rv + (ev - rv) * t
                box(pu - 0.025, pv - 0.025, 0.05, 0.05, height(pu, pv) + 1.2, 1.6, tile_dark)
    # Dark eave board along the two visible edges.
    box(a1 - 0.02, b0, 0.03, b1 - b0, z - 0.6, 0.9, eave)
    box(a0, b1 - 0.02, a1 - a0, 0.03, z - 0.6, 0.9, eave)


def grille(u0, v_face, w, z, h, slats, frame, slat):
    """Air-intake grille on the +v face at v_face: steel frame with horizontal louvres."""
    box(u0, v_face, w, 0.03, z, h, frame)
    for k in range(slats):
        box(u0 + 0.02, v_face + 0.02, w - 0.04, 0.025, z + 0.4 + k * (h - 0.8) / slats, 0.45, slat)


# ---------------------------------------------------------------- the model


def reserve_capital_china(damage=0):
    team = mat(TEAM["china"], 0.45, metal=0.3, grain=0)
    concrete = mat("#8d8f88", 0.9, grain=0.16, scale=16)
    concrete_d = mat("#73756f", 0.9, grain=0.14, scale=16)
    coping = mat("#a3a59e", 0.85, grain=0.1)
    steel = mat("#4a4f52", 0.4, metal=0.85, grain=0.05)
    steel_d = mat("#2c3033", 0.45, metal=0.8, grain=0.03)
    hazard = mat("#202326", 0.6, grain=0)
    stone = mat("#dcd6c8", 0.75, grain=0.08, scale=24)
    stone_d = mat("#c4bdae", 0.8, grain=0.1, scale=24)
    red = mat("#8e2a1e", 0.65, grain=0.05)
    timber = mat("#4a3a2c", 0.8, grain=0.1)
    lattice = mat("#6e2a1f", 0.7, grain=0)
    tile = mat("#9b3a2c", 0.55, grain=0.14, scale=70)  # red glazed tiles
    tile_d = mat("#6a2219", 0.55, grain=0.08, scale=70)
    gold = mat("#c9a14a", 0.3, metal=0.85, grain=0)
    eave = mat("#2f6f6a", 0.6, grain=0.05)
    glass = mat("#33475a", 0.08, grain=0, glass=True)

    # Paving over the whole plot (sunk flush by kit.render), then a white stone podium with a team-coloured band.
    box(0.0, 0.0, W, D, 0, 1, stone_d)
    box(0.12, 0.12, W - 0.24, D - 0.24, 1, 3, stone_d)
    box(W - 0.12, 0.12, 0.012, D - 0.24, 2.2, 0.8, team)
    box(0.12, D - 0.12, W - 0.24, 0.012, 2.2, 0.8, team)
    box(0.1, 0.1, W - 0.2, D - 0.2, 4, 0.6, stone)
    top = 4.6

    # Hall on the podium: stone terrace with balustrade, red columns, timber walls with lattice windows.
    hu0, hv0, hw, hd = 0.45, 0.5, 1.85, 2.95
    box(hu0 - 0.18, hv0 - 0.18, hw + 0.36, hd + 0.36, top, 2.2, stone_d)
    box(hu0 - 0.15, hv0 - 0.15, hw + 0.3, hd + 0.3, top + 2.2, 0.6, stone)
    for k in range(3):  # steps down to the roof on the front
        box(hu0 + hw + 0.18 + k * 0.1, hv0 + hd / 2 - 0.35 + k * 0.05, 0.1, 0.7 - k * 0.1, top, 2.2 - k * 0.7, stone)
    rail_z = top + 2.8
    for u, v, w, d in ((hu0 - 0.15, hv0 + hd + 0.12, hw + 0.3, 0.04), (hu0 - 0.15, hv0 - 0.16, hw + 0.3, 0.04),
                       (hu0 - 0.16, hv0 - 0.15, 0.04, hd + 0.3)):
        box(u, v, w, d, rail_z + 1.4, 0.4, stone)
    for k in range(9):
        box(hu0 - 0.15 + k * (hw + 0.26) / 8, hv0 + hd + 0.12, 0.03, 0.03, rail_z, 1.4, stone)

    hz = top + 2.8
    wall_h = 22
    box(hu0, hv0, hw, hd, hz, wall_h, timber)
    windows("right", hu0, hv0, hw, hd, hz, wall_h, 5, 1, glass, lattice, margin=0.08, fill=0.62)
    windows("left", hu0, hv0, hw, hd, hz, wall_h, 3, 1, glass, lattice, margin=0.1, fill=0.6)
    # Central door on the front.
    box(hu0 + hw, hv0 + hd / 2 - 0.2, 0.015, 0.4, hz, 6.5, red)
    box(hu0 + hw + 0.01, hv0 + hd / 2 - 0.005, 0.01, 0.01, hz, 6.5, lattice)
    # Veranda columns along the front and the +v side.
    for k in range(7):
        cylinder(hu0 + hw + 0.12, hv0 + 0.05 + k * (hd - 0.1) / 6, 0.03, hz, wall_h, red, 10)
    for k in range(4):
        cylinder(hu0 + 0.1 + k * (hw - 0.05) / 3, hv0 + hd + 0.12, 0.03, hz, wall_h, red, 10)
    # Team-coloured beam and painted bracket band under the eaves.
    bz = hz + wall_h
    box(hu0 - 0.04, hv0 - 0.04, hw + 0.22, hd + 0.2, bz, 1.0, team)
    box(hu0 - 0.08, hv0 - 0.08, hw + 0.3, hd + 0.28, bz + 1.0, 1.2, eave)
    eave_d = mat("#5a1e16", 0.7, grain=0)
    # Double eaves: a lower skirt roof round the hall, an upper storey with its own bracket band, then the main roof.
    hall_roof(hu0 - 0.08, hv0 - 0.08, hw + 0.3, hd + 0.28, bz + 2.4, 5, 0.3, 2.2, tile, tile_d, eave_d, gold, ornate=False)
    su0, sv0, sw, sd = hu0 + 0.2, hv0 + 0.2, hw - 0.3, hd - 0.4
    sz = bz + 6.5
    box(su0, sv0, sw, sd, sz, 6, timber)
    windows("right", su0, sv0, sw, sd, sz, 6, 6, 1, glass, lattice, margin=0.08, fill=0.6)
    windows("left", su0, sv0, sw, sd, sz, 6, 3, 1, glass, lattice, margin=0.1, fill=0.6)
    box(su0 - 0.03, sv0 - 0.03, sw + 0.06, sd + 0.06, sz + 6, 0.8, team)
    box(su0 - 0.07, sv0 - 0.07, sw + 0.14, sd + 0.14, sz + 6.8, 1.2, eave)
    hall_roof(su0 - 0.07, sv0 - 0.07, sw + 0.14, sd + 0.14, sz + 8.0, 11, 0.24, 3.0, tile, tile_d, eave_d, gold)

    ruined_render("reservecapital-china", (W, D), 72, damage, seed=13, cut_u=1.5)


MODELS = {"reservecapital-china": reserve_capital_china, **{f"reservecapital-china-d{d}": (lambda d=d: reserve_capital_china(d)) for d in (1, 2, 3)}}

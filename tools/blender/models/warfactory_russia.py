"""Nordursia War Factory (5 x 4): the design kept as it was (red-brick hall with piers, lit clerestory under a gable
roof, concrete front block with three roller-door bays, the administration tower with the red star, the striped
chimney at the back corner and the tower crane), with the ART_GUIDE detail pass:
- brick hall: mortar courses, segmental brick arches and stone sills over the windows, a dark plinth, pier caps;
- clerestory roof: standing seams on both slopes, ridge cap, gable ends with louvres, gutter board;
- every flat roof (hall, front block, tower): bitumen membrane with joint lines, a coping round the parapet, patches,
  vents, brick chimneys, plant boxes, a radio mast and a roof hatch;
- chimney: base plinth, stepped rings, an iron ladder and a cap lip;
- front block: horizontal formwork joints on the concrete, door lamps, bollards beside each bay;
- tower: floor bands, entrance canopy, a team band under the cornice.
Team colour (TEAM["russia"]): chimney bands, the front block band, the star, the tower band and the mast light.

Plot: u 0..5, v 0..4 (front at +v). Heights in art px. Own geometry only (kit primitives and materials).
"""
import math
import random

import bmesh

from kit import _obj, box, cylinder, lathe, mat, render, rod, roof, zp, TEAM

TEAMC = TEAM["russia"]


def M():
    return dict(
        brick=mat("#8a4a36", 0.9, grain=0.2, scale=60),
        brick_d=mat("#6e3a2a", 0.9, grain=0.15, scale=60),
        mortar=mat("#a7806c", 0.95, grain=0.05),
        arch=mat("#7a3e2c", 0.9, grain=0.2, scale=60),
        stone=mat("#cfc8b8", 0.85, grain=0.08),
        conc=mat("#9a9a8a", 0.9, grain=0.15, scale=20),
        conc_d=mat("#82827a", 0.9, grain=0.12),
        joint=mat("#7c7c70", 0.9, grain=0),
        tar=mat("#4a4642", 0.97, grain=0.25, scale=8),
        tar_d=mat("#36332f", 0.98, grain=0.2, scale=12),
        tar_j=mat("#5a5550", 0.95, grain=0),
        roofm=mat("#5a524a", 0.7, metal=0.3, grain=0.06),
        seam=mat("#6e665d", 0.55, metal=0.4, grain=0),
        steel=mat("#8a8d90", 0.45, metal=0.7, grain=0.05),
        iron=mat("#3a3c3e", 0.5, metal=0.6, grain=0),
        glass=mat("#2e4256", 0.1, grain=0, glass=True),
        lit=mat("#c9b98a", 0.3, grain=0, emit="#e8c880"),
        frame=mat("#cfcac0", 0.7, grain=0.05),
        frame_d=mat("#5a5a52", 0.7, grain=0.05),
        door=mat("#2a2e33", 0.6, metal=0.4, grain=0.04),
        slat=mat("#454a50", 0.5, metal=0.5, grain=0),
        lamp=mat("#e8d690", 0.4, grain=0, emit="#ffd890"),
        white=mat("#e4e0d8", 0.8),
        black=mat("#2a2a2a", 0.9, grain=0),
        crane=mat("#e0b23a", 0.55, metal=0.3, grain=0.05),
        plinth=mat("#6a645a", 0.95, grain=0.15, scale=8),
        team=mat(TEAMC, 0.6, grain=0.05),
        team_lit=mat(TEAMC, 0.4, emit=TEAMC),
    )


# ---------------------------------------------------------------- parts


def plate(face, u, v, w, d, s0, s1, z, h, m, t):
    """Plate on a box face: "left" = +v (s along u), "right" = +u (s along v from v + d down)."""
    if face == "left":
        box(u + s0, v + d, s1 - s0, t, z, h, m)
    else:
        box(u + w, v + d - s1, t, s1 - s0, z, h, m)


def framed_windows(K, face, u, v, w, d, z, h, cols, rows, glass, frame, fill=0.5, sill=True, arch=False):
    """Window grid: glass behind a full frame with a mullion cross; stone sill; segmental brick arch above."""
    L = d if face == "right" else w
    fw = 0.025
    for c in range(cols):
        for r in range(rows):
            s0 = (c + 0.5 - fill / 2) / cols * L
            s1 = (c + 0.5 + fill / 2) / cols * L
            cellh = h / rows
            z0 = z + r * cellh + cellh * 0.22
            zh = cellh * 0.6
            plate(face, u, v, w, d, s0, s1, z0, zh, glass, 0.008)
            plate(face, u, v, w, d, s0 - fw, s0, z0, zh, frame, 0.024)
            plate(face, u, v, w, d, s1, s1 + fw, z0, zh, frame, 0.024)
            plate(face, u, v, w, d, s0 - fw, s1 + fw, z0 + zh, 0.6, frame, 0.024)
            plate(face, u, v, w, d, (s0 + s1) / 2 - 0.008, (s0 + s1) / 2 + 0.008, z0, zh, frame, 0.018)
            plate(face, u, v, w, d, s0, s1, z0 + zh * 0.55, 0.35, frame, 0.018)
            if sill:
                plate(face, u, v, w, d, s0 - fw * 1.6, s1 + fw * 1.6, z0 - 0.8, 0.8, K["stone"], 0.036)
            if arch:
                n = 7
                for k in range(n):  # segmental arch of radiating bricks
                    a = math.pi * (k + 0.5) / n
                    cs = (s0 + s1) / 2 - math.cos(a) * ((s1 - s0) / 2 + fw)
                    plate(face, u, v, w, d, cs - 0.018, cs + 0.018, z0 + zh + 0.6, 0.6 + 1.2 * math.sin(a), K["arch"], 0.03)


def coursing(K, face, u, v, w, d, z0, z1, step=1.6, m=None):
    L = w if face == "left" else d
    z = z0 + step
    while z < z1 - 0.3:
        plate(face, u, v, w, d, 0, L, z, 0.22, m or K["mortar"], 0.004)
        z += step


def cornice(u, v, w, d, z, m, steps):
    zz = z
    for grow, hh in steps:
        box(u - grow, v - grow, w + 2 * grow, d + 2 * grow, zz, hh, m)
        zz += hh
    return zz


def flat_roof(K, u, v, w, d, z, rng, coping=None, extras=True, avoid=()):
    """Bitumen membrane with joint lines and patches, a coping round the edge, vents, chimneys, plant boxes, a hatch."""
    box(u, v, w, d, z, 0.3, K["tar"])
    n = max(1, int(w / 0.3))
    for k in range(1, n):
        box(u + k * w / n - 0.004, v, 0.008, d, z + 0.3, 0.06, K["tar_j"])
    m = max(1, int(d / 0.3))
    for k in range(1, m):
        box(u, v + k * d / m - 0.004, w, 0.008, z + 0.3, 0.06, K["tar_j"])
    for _ in range(max(2, int(w * d * 1.5))):
        pw, pd = 0.12 + rng.random() * 0.3, 0.1 + rng.random() * 0.25
        box(u + 0.05 + rng.random() * max(0.01, w - pw - 0.1), v + 0.05 + rng.random() * max(0.01, d - pd - 0.1), pw, pd, z + 0.3, 0.06, K["tar_d"])
    cop = coping or K["conc_d"]
    for bx in ((u - 0.03, v - 0.03, w + 0.06, 0.03), (u - 0.03, v + d, w + 0.06, 0.03), (u - 0.03, v, 0.03, d), (u + w, v, 0.03, d)):
        box(*bx, z, 1.4, cop)
    if not extras:
        return
    rects = list(avoid)

    def spot(sw, sd):
        for _ in range(40):
            pu = u + 0.08 + rng.random() * max(0.0, w - 0.16 - sw)
            pv = v + 0.08 + rng.random() * max(0.0, d - 0.16 - sd)
            if all(pu + sw < a or pu > a + c or pv + sd < b or pv > b + e for a, b, c, e in rects):
                rects.append((pu - 0.03, pv - 0.03, sw + 0.06, sd + 0.06))
                return pu, pv
        return None

    zt = z + 0.3
    for _ in range(max(1, int(w * d * 0.8))):  # brick chimneys
        s = 0.1 + rng.random() * 0.05
        p = spot(s, s)
        if p:
            h = 4 + rng.random() * 3
            box(p[0], p[1], s, s, zt, h, K["brick"])
            box(p[0] - 0.01, p[1] - 0.01, s + 0.02, s + 0.02, zt + h, 0.8, K["black"])
            box(p[0] + 0.02, p[1] + s, s - 0.04, 0.004, zt + h - 1.6, 0.3, K["mortar"])
    for _ in range(max(1, int(w * d * 0.5))):  # ventilation boxes with louvres
        p = spot(0.26, 0.18)
        if p:
            box(p[0], p[1], 0.26, 0.18, zt, 2.6, mat("#9a948a", 0.85, grain=0.12))
            box(p[0] - 0.02, p[1] - 0.02, 0.3, 0.22, zt + 2.6, 0.5, mat("#5f6a5c", 0.6, metal=0.3, grain=0.05))
            for k in range(5):
                box(p[0] + 0.03 + k * 0.045, p[1] + 0.18, 0.025, 0.004, zt + 0.5, 1.6, K["iron"])
    for _ in range(max(1, int(w * d * 0.6))):  # mushroom vents
        p = spot(0.08, 0.08)
        if p:
            cylinder(p[0] + 0.04, p[1] + 0.04, 0.025, zt, 1.8, K["steel"], 10)
            lathe(p[0] + 0.04, p[1] + 0.04, zt + 1.8, [(0.05, 0), (0.0, 0.9)], K["steel"], 10, cap_bottom=True)
    p = spot(0.14, 0.14)
    if p:  # roof hatch
        box(p[0], p[1], 0.14, 0.14, zt, 0.8, K["conc_d"])
        box(p[0] + 0.015, p[1] + 0.015, 0.11, 0.11, zt + 0.8, 0.2, K["iron"])


def roller_doors(K, u, v, w, z, h, count, frame, width=0.55):
    for i in range(count):
        cu = u + (i + 0.5) * w / count
        hw = width * w / count / 2
        box(cu - hw - 0.06, v, hw * 2 + 0.12, 0.03, z, h + 1.5, frame)
        box(cu - hw, v + 0.02, hw * 2, 0.02, z, h, K["door"])
        for k in range(1, 12):
            box(cu - hw, v + 0.035, hw * 2, 0.008, z + h * k / 12, 0.3, K["slat"])
        box(cu - hw - 0.01, v + 0.03, hw * 2 + 0.02, 0.04, z + h, 1.2, K["iron"])  # roller box
        box(cu - 0.06, v + 0.03, 0.12, 0.05, z + h + 2, 0.8, K["lamp"])
        for x in (cu - hw - 0.1, cu + hw + 0.07):  # bollards
            cylinder(x + 0.015, v + 0.1, 0.018, z, 3, mat("#e0b020", 0.6, grain=0), 10)
            cylinder(x + 0.015, v + 0.1, 0.019, z + 1.2, 0.6, K["black"], 10)


def star(cu, v, cz, r, m):
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.4
        pts.append((cu + math.cos(a) * rr / 32, cz + math.sin(a) * rr))
    bm = bmesh.new()
    front = [bm.verts.new((x, v + 0.02, zp(z))) for x, z in pts]
    back = [bm.verts.new((x, v, zp(z))) for x, z in pts]
    cf, cb = bm.verts.new((cu, v + 0.02, zp(cz))), bm.verts.new((cu, v, zp(cz)))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((cf, front[i], front[j]))
        bm.faces.new((cb, back[j], back[i]))
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _obj("star", bm, m)


def tower_crane(K, u, v, z, h, reach, direction):
    c = K["crane"]
    box(u - 0.2, v - 0.2, 0.4, 0.4, z, 2, mat("#8a8a84", 0.9))
    m = 0.1
    top = z + h
    corners = [(u - m, v - m), (u + m, v - m), (u + m, v + m), (u - m, v + m)]
    for cu, cv in corners:
        rod((cu, cv, zp(z + 2)), (cu, cv, zp(top)), 0.012, c, 4)
    bays = max(4, round(h / 5))
    for k in range(bays):
        z0 = z + 2 + (top - z - 2) * k / bays
        z1 = z + 2 + (top - z - 2) * (k + 1) / bays
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            rod((a[0], a[1], zp(z0)), (b[0], b[1], zp(z1)), 0.006, c, 4)
            rod((a[0], a[1], zp(z1)), (b[0], b[1], zp(z1)), 0.006, c, 4)
    box(u - 0.15, v - 0.15, 0.3, 0.3, top, 3, c)
    box(u - 0.05 + direction * 0.12, v + 0.1, 0.22, 0.2, top - 4, 5, mat("#d8dce0", 0.5))
    box(u - 0.04 + direction * 0.12, v + 0.3, 0.2, 0.01, top - 2.5, 3, K["glass"])
    jz = top + 3
    tip = u + direction * reach
    back = u - direction * reach * 0.35
    for vv in (v - 0.05, v + 0.05):
        rod((u, vv, zp(jz)), (tip, vv, zp(jz)), 0.01, c, 4)
        rod((u, vv, zp(jz)), (back, vv, zp(jz)), 0.01, c, 4)
    rod((u, v, zp(jz + 3.5)), (tip, v, zp(jz + 3.5)), 0.01, c, 4)
    n = max(3, round(reach * 5))
    for k in range(n):
        a = u + direction * reach * k / n
        b = u + direction * reach * (k + 1) / n
        for vv in (v - 0.05, v + 0.05):
            rod((a, vv, zp(jz)), (b, v, zp(jz + 3.5)), 0.005, c, 4)
    rod((u, v, zp(jz)), (u, v, zp(jz + 10)), 0.015, c, 4)
    rod((u, v, zp(jz + 10)), (tip, v, zp(jz + 3.5)), 0.005, K["iron"], 4)
    rod((u, v, zp(jz + 10)), (back, v, zp(jz)), 0.005, K["iron"], 4)
    box(back - (0 if direction > 0 else 0.3), v - 0.12, 0.3, 0.24, jz - 3, 4, mat("#9a9890", 0.9))
    tu = u + direction * reach * 0.62
    box(tu - 0.07, v - 0.07, 0.14, 0.14, jz - 1.5, 1.4, mat("#3a3a3a", 0.6))
    hz = max(z + 6, jz - 18)
    rod((tu, v, zp(jz - 1.5)), (tu, v, zp(hz + 2)), 0.004, K["black"], 4)
    box(tu - 0.06, v - 0.06, 0.12, 0.12, hz, 2.2, mat("#d84a2a", 0.6, grain=0))


def seamed_gable(K, u, v, w, d, z, h, over=0.06):
    """Gable roof (ridge along u) with standing seams on both slopes, ridge cap, gutters and louvred gable ends."""
    roof(u, v, w, d, z, h, K["roofm"], kind="gable", ridge="u", overhang=over)
    a0, a1, b0, b1 = u - over, u + w + over, v - over, v + d + over
    cv = (b0 + b1) / 2
    n = round((a1 - a0) / 0.05)
    for k in range(1, n):
        pu = a0 + k * (a1 - a0) / n
        for e in (b0, b1):
            rod((pu, e, zp(z + 0.3)), (pu, cv, zp(z + h + 0.3)), 0.0045, K["seam"], 4)
    box(a0, cv - 0.02, a1 - a0, 0.04, z + h - 0.2, 0.8, K["seam"])
    for e in (b0, b1 - 0.02):
        box(a0, e, a1 - a0, 0.02, z - 0.5, 0.7, K["iron"])
    x = u + w - 0.002  # louvred gable end on the visible (+u) side
    if True:
        for k in range(3):
            box(x, cv - 0.12 + k * 0.03, 0.006, 0.24 - k * 0.06, z + 0.4 + k * 0.6, 0.35, K["iron"])


# ---------------------------------------------------------------- the model


def warfactory_russia():
    K = M()
    rng = random.Random("warfactory-russia")
    box(0, 0, 5, 4, 0, 2, K["plinth"])

    # Chimney (back corner) with team bands, ladder and cap.
    cylinder(4.4, 0.6, 0.33, 2, 2.4, K["conc_d"], 32)
    lathe(4.4, 0.6, 2, [(0.27, 0), (0.22, 68)], K["white"], cap_top=True)
    for i in range(5):
        lathe(4.4, 0.6, 6 + i * 14, [(0.272 - i * 0.01, 0), (0.262 - i * 0.01, 6)], K["team"])
    for k in range(1, 6):
        zz = k * 13.5
        cylinder(4.4, 0.6, 0.27 - zz / 68 * 0.05 + 0.006, zz, 0.6, K["iron"], 32)  # steel hoops
    for x in (-0.03, 0.03):  # ladder up the front of the chimney
        rod((4.4 + x, 0.875, zp(4)), (4.4 + x, 0.83, zp(68)), 0.004, K["iron"], 4)
    for k in range(32):
        zz = 4 + k * 2
        vv = 0.875 - 0.045 * (zz - 4) / 64
        rod((4.37, vv, zp(zz)), (4.43, vv, zp(zz)), 0.003, K["iron"], 4)
    cylinder(4.4, 0.6, 0.245, 69.5, 1.2, K["iron"], 32)
    cylinder(4.4, 0.6, 0.24, 70, 1.5, K["black"], 32)
    cylinder(4.4, 0.6, 0.008, 71.5, 4, K["iron"], 6)  # lightning rod

    # Brick hall.
    box(0.1, 0.1, 4.8, 3.3, 2, 22, K["brick"])
    box(0.09, 0.09, 4.82, 3.32, 2, 2.2, K["brick_d"])  # dark plinth course
    coursing(K, "right", 0.1, 0.1, 4.8, 3.3, 4.2, 22)
    for i in range(11):
        box(0.1 + i * 4.8 / 10 - 0.04, 3.4, 0.08, 0.03, 2, 22, K["brick_d"])
        box(0.1 + i * 4.8 / 10 - 0.05, 3.4, 0.1, 0.04, 20.6, 1.0, K["stone"])
    for i in range(8):
        box(4.9, 0.1 + i * 3.3 / 7 - 0.04, 0.03, 0.08, 2, 22, K["brick_d"])
        box(4.9, 0.1 + i * 3.3 / 7 - 0.05, 0.04, 0.1, 20.6, 1.0, K["stone"])
    framed_windows(K, "right", 0.1, 0.1, 4.8, 3.3, 6, 16, 7, 1, K["glass"], K["frame"], arch=True)
    cornice(0.1, 0.1, 4.8, 3.3, 22, K["arch"], ((0.015, 0.7), (0.035, 0.7), (0.05, 0.9)))
    for k in range(int(3.3 / 0.08)):  # corbel bricks under the cornice (side)
        box(4.9, 0.12 + k * 0.08, 0.02, 0.04, 21.2, 0.8, K["arch"])
    flat_roof(K, 0.2, 0.2, 4.6, 3.1, 24.2, rng, coping=K["arch"],
              avoid=[(0.45, 1.25, 4.1, 1.0), (1.85, 2.85, 1.3, 1.15), (0.2, 0.2, 0.6, 0.6), (4.05, 0.2, 0.7, 0.7)])
    # Radio mast with the team light.
    for du, dv in ((0, 0), (0.06, 0), (0.03, 0.05)):
        rod((3.3 + du, 2.5 + dv, zp(24.5)), (3.33, 2.517, zp(42.5)), 0.006, K["steel"])
    for k in range(1, 5):
        f = 1 - k / 5
        rod((3.33 - 0.03 * f, 2.517 - 0.017 * f, zp(24.5 + 18 * k / 5)), (3.33 + 0.03 * f, 2.517 - 0.017 * f, zp(24.5 + 18 * k / 5)), 0.004, K["steel"])
    cylinder(3.33, 2.517, 0.018, 42.5, 1.2, K["team_lit"], 8)

    # Clerestory.
    box(0.5, 1.3, 4.0, 0.9, 24, 8, K["brick"])
    coursing(K, "left", 0.5, 1.3, 4.0, 0.9, 24.5, 32, step=1.4)
    coursing(K, "right", 0.5, 1.3, 4.0, 0.9, 24.5, 32, step=1.4)
    framed_windows(K, "left", 0.5, 1.3, 4.0, 0.9, 22, 12, 12, 1, K["lit"], K["frame_d"], fill=0.6, sill=False)
    framed_windows(K, "right", 0.5, 1.3, 4.0, 0.9, 22, 12, 3, 1, K["lit"], K["frame_d"], fill=0.6, sill=False)
    box(0.48, 2.2, 4.04, 0.04, 24.3, 0.8, K["stone"])  # sill course under the clerestory glazing
    cornice(0.5, 1.3, 4.0, 0.9, 31.4, K["arch"], ((0.02, 0.6),))
    seamed_gable(K, 0.5, 1.3, 4.0, 0.9, 32, 3)
    for u in (0.12, 4.88):
        rod((u, 3.43, zp(2)), (u, 3.43, zp(22)), 0.012, K["iron"], 8)
    for v in (1.2, 2.6):
        rod((4.93, v, zp(2)), (4.93, v, zp(22)), 0.012, K["iron"], 8)
    # Steam pipe along the side wall to the chimney, on brackets.
    rod((4.97, 3.2, zp(10)), (4.97, 0.9, zp(10)), 0.03, K["steel"], 10)
    for k in range(6):
        vv = 3.1 - k * 0.42
        box(4.9, vv - 0.01, 0.07, 0.02, 9.2, 0.6, K["iron"])

    # Concrete front block with the bay doors.
    box(0.1, 3.4, 4.8, 0.55, 2, 18, K["conc"])
    coursing(K, "left", 0.1, 3.4, 4.8, 0.55, 2, 16, step=2.4, m=K["joint"])
    coursing(K, "right", 0.1, 3.4, 4.8, 0.55, 2, 16, step=2.4, m=K["joint"])
    for k in range(1, 12):  # formwork panel joints
        box(0.1 + k * 0.4, 3.95, 0.006, 0.004, 2, 14, K["joint"])
    cornice(0.1, 3.4, 4.8, 0.55, 20, mat("#7a7a6c", 0.9, grain=0.12), ((0.015, 0.6), (0.035, 0.8)))
    box(0.1, 3.4, 4.8, 0.56, 16, 2.6, K["team"])
    box(4.9, 3.4, 0.004, 0.56, 16, 2.6, K["team"])
    flat_roof(K, 0.1, 3.42, 1.75, 0.5, 21.4, rng, extras=False)
    flat_roof(K, 3.05, 3.42, 1.85, 0.5, 21.4, rng, extras=False)
    for cu in (0.6, 1.3, 3.6, 4.4):
        cylinder(cu, 3.67, 0.025, 21.7, 1.6, K["steel"], 10)
        lathe(cu, 3.67, 23.3, [(0.05, 0), (0.0, 0.8)], K["steel"], 10, cap_bottom=True)
    roller_doors(K, 0.1, 3.95, 4.8, 2, 12.5, 3, mat("#6c6c60", 0.9))

    # Administration tower with star.
    box(1.9, 2.9, 1.2, 1.05, 2, 40, K["conc"])
    for k in range(1, 6):  # floor bands
        box(1.895, 2.895, 1.21, 1.06, 2 + k * 6.6, 0.4, K["conc_d"])
    framed_windows(K, "left", 1.9, 2.9, 1.2, 1.05, 14, 22, 3, 3, K["glass"], K["frame"])
    framed_windows(K, "right", 1.9, 2.9, 1.2, 1.05, 4, 32, 3, 4, K["glass"], K["frame"])
    box(1.895, 2.895, 1.21, 1.06, 40.6, 0.9, K["team"])  # team band under the cornice
    cornice(1.9, 2.9, 1.2, 1.05, 42, K["conc_d"], ((0.02, 0.8), (0.045, 1.2)))
    flat_roof(K, 1.9, 2.9, 1.2, 1.05, 44, rng, extras=False)
    box(2.0, 3.0, 0.3, 0.25, 44, 3, mat("#8a8a7e", 0.9))
    for k in range(5):
        box(2.03 + k * 0.05, 3.25, 0.03, 0.004, 44.6, 1.8, K["iron"])
    cylinder(2.8, 3.1, 0.06, 44, 3, K["steel"], 12)
    lathe(2.8, 3.1, 47, [(0.09, 0), (0.0, 1.5)], K["steel"], segs=12, cap_bottom=True)
    # Entrance with canopy and steps.
    box(2.3, 3.95, 0.4, 0.04, 2, 9, K["door"])
    box(2.495, 3.99, 0.01, 0.004, 2, 8.4, K["frame_d"])
    box(2.25, 3.95, 0.5, 0.14, 11, 0.8, K["conc_d"])  # canopy
    for x in (2.27, 2.71):
        rod((x, 4.07, zp(11)), (x, 4.02, zp(13)), 0.004, K["iron"], 4)
    for k in range(4):
        box(2.2 + k * 0.01, 3.95 + k * 0.05, 0.6, 0.05, 2 - k * 0.5, 0.5, K["conc"])
    star(2.5, 3.98, 33, 6.4, mat(TEAMC, 0.5, grain=0))
    star(2.5, 3.975, 33, 7.4, K["stone"])
    tower_crane(K, 0.45, 0.45, 2, 56, 1.9, 1)
    render("warfactory-russia", (5, 4), 92)


MODELS = {"warfactory-russia": warfactory_russia}

from models._wreck import with_damage  # noqa: E402

with_damage(MODELS, __name__, flags={"warfactory-russia": [(1.55, 3.55)]})

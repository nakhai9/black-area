"""Naval Port (12 x 8): U-shaped harbour, airstrip on the back quay, two piers with aircraft pads; the basin stays open (transparent) for the sea."""
import math

from kit import box, cylinder, lathe, mat, render, rod, roof, windows, zp, TEAM

W, D, DECK = 12, 8, 3
QUAY, PIER = 3, 3
RUNWAY_D = 1.6
SLOTS = [(1.5, 4.4), (10.5, 4.4), (1.5, 6.8), (10.5, 6.8)]
MATERIALS = {
    "usa": ("#8b9095", "#c0c4c8", "#6c747c"),
    "russia": ("#7c7d78", "#8a8f84", "#5b6b58"),
    "china": ("#86847a", "#b8b0a0", "#4e6a8a"),
    "islamic": ("#a89a80", "#d0bb92", "#c8c0b0"),
    "europe": ("#8a8e90", "#a8b0b8", "#3f5a78"),
}


def flat(u0, v0, u1, v1, z, m):
    """Painted strip lying on the deck."""
    box(u0, v0, u1 - u0, v1 - v0, z, 0.08, m)


def lattice(a, b, r, m, n, side):
    """Truss: chords a->b and the same offset by side (BU vector), with rungs and diagonals."""
    a2 = tuple(x + s for x, s in zip(a, side))
    b2 = tuple(x + s for x, s in zip(b, side))
    rod(a, b, r, m)
    rod(a2, b2, r, m)
    for i in range(n + 1):
        t0 = i / n
        p0 = tuple(x + (y - x) * t0 for x, y in zip(a, b))
        q0 = tuple(x + (y - x) * t0 for x, y in zip(a2, b2))
        rod(p0, q0, r * 0.7, m, 4)
        if i < n:
            t1 = (i + 1) / n
            q1 = tuple(x + (y - x) * t1 for x, y in zip(a2, b2))
            rod(p0, q1, r * 0.7, m, 4)


def steel_leg(cu, cv, m, h=20, r=0.07):
    """Square lattice column: four corner chords with X bracing on every face."""
    pts = [(cu - r, cv - r), (cu + r, cv - r), (cu + r, cv + r), (cu - r, cv + r)]
    z0, z1 = zp(DECK + 1.2), zp(DECK + h)
    for u, v in pts:
        rod((u, v, z0), (u, v, z1), 0.012, m, 4)
    n = 6
    for i in range(n):
        za = z0 + (z1 - z0) * i / n
        zb = z0 + (z1 - z0) * (i + 1) / n
        for k in range(4):
            a, b = pts[k], pts[(k + 1) % 4]
            rod((a[0], a[1], za), (b[0], b[1], zb), 0.006, m, 4)
            rod((a[0], a[1], zb), (b[0], b[1], zb), 0.006, m, 4)


def fuel_tank(cu, cv, r, h, m, dark):
    """Vertical tank on a plinth with a cone roof, rim rail, spiral-free caged ladder."""
    cylinder(cu, cv, r + 0.06, DECK, 0.8, dark, 32)
    cylinder(cu, cv, r, DECK + 0.8, h, m, 40)
    for k in range(1, 4):
        cylinder(cu, cv, r + 0.004, DECK + 0.8 + h * k / 4, 0.25, dark, 40)
    lathe(cu, cv, DECK + 0.8 + h, [(r + 0.01, 0), (0.05, 2.2), (0.0005, 2.3)], m, 40, cap_bottom=True)
    for i in range(16):
        a = 2 * math.pi * i / 16
        x, y = cu + r * math.cos(a), cv + r * math.sin(a)
        rod((x, y, zp(DECK + 0.8 + h)), (x, y, zp(DECK + 2.2 + h)), 0.004, dark, 4)
    lathe(cu, cv, DECK + 2.2 + h, [(r, 0), (r, 0.2)], dark, 40)
    lu, lv = cu + r * 0.72, cv + r * 0.72
    for dv in (-0.05, 0.05):
        rod((lu + 0.02, lv + dv, zp(DECK)), (lu + 0.02, lv + dv, zp(DECK + h + 2)), 0.005, dark, 4)
    for k in range(int(h / 1.2)):
        z = zp(DECK + 0.8 + k * 1.2)
        rod((lu + 0.02, lv - 0.05, z), (lu + 0.02, lv + 0.05, z), 0.003, dark, 4)


def truck(u, v, c):
    """Small yard tractor along u."""
    box(u, v, 0.5, 0.22, DECK + 0.4, 1.6, mat("#2a2c2e", 0.6))
    box(u + 0.5, v, 0.22, 0.22, DECK + 0.4, 2.6, mat(c, 0.5, grain=0.04))
    box(u + 0.72, v + 0.03, 0.006, 0.16, DECK + 1.8, 1, mat("#33475a", 0.1, grain=0, glass=True))
    for du in (0.1, 0.55):
        for dv in (0.0, 0.22):
            cylinder(u + du, v + dv, 0.07, DECK, 0.8, mat("#151515", 0.9, grain=0), 12)


def container(u, v, z, c):
    m = mat(c, 0.75, metal=0.2, grain=0.12, scale=40)
    box(u, v, 1.3, 0.55, z, 3, m)
    rib = mat(c, 0.9, grain=0.05)
    for k in range(7):
        box(u + 0.08 + k * 0.18, v + 0.55, 0.04, 0.01, z + 0.2, 2.6, rib)
    box(u + 1.3, v + 0.05, 0.01, 0.45, z + 0.2, 2.6, mat("#3a3c3e", 0.6, metal=0.4))


def port(faction):
    team = TEAM[faction]
    quay_c, shed_c, roof_c = MATERIALS[faction]
    concrete = mat(quay_c, 0.92, grain=0.18, scale=10)
    wall = mat("#5e5c56", 0.95, grain=0.2, scale=14)
    asphalt = mat("#3a3c40", 0.9, grain=0.1, scale=30)
    paint = mat("#d4d2c8", 0.7, grain=0.05)
    yellow = mat("#d8b23a", 0.6, grain=0.05)
    rubber = mat("#1e1f21", 0.9, grain=0)
    steel = mat("#5c5f62", 0.5, metal=0.6, grain=0.03)
    teamm = mat(team, 0.5, grain=0.03)
    glass = mat("#33475a", 0.1, grain=0, glass=True)
    shed = mat(shed_c, 0.85, grain=0.1)
    roofm = mat(roof_c, 0.7, metal=0.3, grain=0.05)
    frame = mat("#d0d4d8", 0.6)

    # Quay and piers: concrete deck on darker sea walls.
    for u, v, w, d in [(0, 0, W, QUAY), (0, QUAY, PIER, D - QUAY), (W - PIER, QUAY, PIER, D - QUAY)]:
        box(u, v, w, d, 0, DECK - 0.6, wall)
        box(u, v, w, d, DECK - 0.6, 0.6, concrete)
    in0, in1 = PIER, W - PIER
    # Team band and fenders on the quay wall facing the basin, fenders on the piers' inner walls.
    box(in0, QUAY, in1 - in0, 0.012, 1.0, 0.7, teamm)
    for k in range(10):
        box(in0 + 0.3 + k * 0.6, QUAY, 0.12, 0.05, 0.1, 2.3, rubber)
    for k in range(8):
        v = QUAY + 0.3 + k * 0.6
        box(PIER, v, 0.05, 0.12, 0.1, 2.3, rubber)
        box(in1 - 0.05, v, 0.05, 0.12, 0.1, 2.3, rubber)
    # Yellow safety edges and bollards along the basin.
    flat(in0, QUAY - 0.1, in1, QUAY - 0.04, DECK, yellow)
    flat(in0 - 0.1, QUAY, in0 - 0.04, D, DECK, yellow)
    flat(in1 + 0.04, QUAY, in1 + 0.1, D, DECK, yellow)
    bol = mat("#2c2e30", 0.6, metal=0.4, grain=0)
    v = QUAY + 0.5
    while v < D:
        for u in (in0 - 0.2, in1 + 0.2):
            cylinder(u, v, 0.07, DECK, 1.4, bol, 12)
            cylinder(u, v, 0.09, DECK + 1.4, 0.4, bol, 12)
        v += 1.1
    for k in range(5):
        cylinder(in0 + 0.6 + 1.2 * k, QUAY - 0.2, 0.07, DECK, 1.4, bol, 12)

    # Airstrip along the back edge.
    box(0, 0, W, RUNWAY_D, DECK, 0.05, asphalt)
    flat(0, 0.06, W, 0.12, DECK, paint)
    flat(0, RUNWAY_D - 0.12, W, RUNWAY_D - 0.06, DECK, paint)
    mid = RUNWAY_D / 2
    u = 0.6
    while u < W - 0.7:
        flat(u, mid - 0.04, u + 0.5, mid + 0.04, DECK, paint)
        u += 0.9
    for u in (0.15, W - 0.3):
        for k in range(4):
            flat(u, 0.22 + k * 0.33, u + 0.15, 0.4 + k * 0.33, DECK, paint)
    # Taxiways and parking pads.
    pad = mat("#76787a", 0.9, grain=0.12, scale=12)
    for u in (PIER / 2, W - PIER / 2):
        flat(u - 0.04, RUNWAY_D, u + 0.04, D - 0.3, DECK, yellow)
    for u, v in SLOTS:
        box(u - 1.25, v - 0.9, 2.5, 1.8, DECK, 0.04, pad)
        t = 0.04
        flat(u - 1.25, v - 0.9, u + 1.25, v - 0.9 + t, DECK, paint)
        flat(u - 1.25, v + 0.9 - t, u + 1.25, v + 0.9, DECK, paint)
        flat(u - 1.25, v - 0.9, u - 1.25 + t, v + 0.9, DECK, paint)
        flat(u + 1.25 - t, v - 0.9, u + 1.25, v + 0.9, DECK, paint)
        flat(u - 0.35, v - 0.04, u + 0.35, v + 0.04, DECK, paint)

    # Harbour office (two floors, flat roof) with the control tower on it.
    ou, ov, ow, od = 3.4, RUNWAY_D + 0.15, 2.2, 1.0
    box(ou, ov, ow, od, DECK, 8, shed, bevel=0.01)
    box(ou - 0.03, ov - 0.03, ow + 0.06, od + 0.06, DECK + 8, 0.8, mat("#4a4c4e", 0.8))
    windows("left", ou, ov, ow, od, DECK, 8, 7, 2, glass, frame=frame)
    windows("right", ou, ov, ow, od, DECK, 8, 3, 2, glass, frame=frame)
    tu, tv = 4.0, RUNWAY_D + 0.65
    box(tu - 0.16, tv - 0.16, 0.32, 0.32, DECK + 8.8, 11.2, shed)
    box(tu - 0.34, tv - 0.34, 0.68, 0.68, DECK + 20, 1.2, steel)
    box(tu - 0.3, tv - 0.3, 0.6, 0.6, DECK + 21.2, 4.8, glass)
    box(tu - 0.36, tv - 0.36, 0.72, 0.72, DECK + 26, 1.4, teamm)
    rod((tu, tv, zp(DECK + 27.4)), (tu, tv, zp(DECK + 35)), 0.012, mat("#c0c0c0", 0.4, metal=0.8))
    box(tu + 0.1, tv - 0.2, 0.15, 0.15, DECK + 27.4, 1.5, mat("#e8e8e0", 0.5))

    # Warehouse at the left corner of the quay (gable metal roof, roller door).
    wu, wv, ww, wd = 0.3, RUNWAY_D + 0.15, 1.9, 1.15
    box(wu, wv, ww, wd, DECK, 7, shed)
    roof(wu, wv, ww, wd, DECK + 7, 3.5, roofm, kind="gable", ridge="u", overhang=0.05)
    box(wu + 0.5, wv + wd, 0.8, 0.015, DECK, 5, mat("#6e7276", 0.5, metal=0.6))
    box(wu + 0.2, wv + wd, ww - 0.4, 0.016, DECK + 5.5, 0.6, teamm)

    # Gantry crane: legs braced by trusses, girder, lattice boom over the basin, cab, hoist.
    crane = mat(team, 0.55, metal=0.3, grain=0.04)
    cz0, cz1 = zp(DECK + 1.2), zp(DECK + 20)
    for lu in (7.0, 7.9):
        box(lu - 0.03, RUNWAY_D + 0.05, 0.06, QUAY - RUNWAY_D - 0.1, DECK, 0.3, steel)
        for lv in (RUNWAY_D + 0.2, QUAY - 0.2):
            steel_leg(lu, lv, crane)
            box(lu - 0.1, lv - 0.1, 0.2, 0.2, DECK, 1.2, steel)  # bogie
        rod((lu, RUNWAY_D + 0.2, cz0 + zp(10)), (lu, QUAY - 0.2, cz0 + zp(10)), 0.015, crane, 4)
    for lv in (RUNWAY_D + 0.2, QUAY - 0.2):
        rod((7.0, lv, cz0 + zp(2)), (7.9, lv, cz1 - zp(2)), 0.012, crane, 4)
        rod((7.9, lv, cz0 + zp(2)), (7.0, lv, cz1 - zp(2)), 0.012, crane, 4)
    box(6.85, RUNWAY_D + 0.1, 1.2, QUAY - RUNWAY_D - 0.2, DECK + 20, 2.5, crane)
    bz0 = zp(DECK + 22.5)
    lattice((7.3, RUNWAY_D + 0.2, bz0), (7.3, 5.6, bz0), 0.014, crane, 14, (0.3, 0, 0))
    lattice((7.3, RUNWAY_D + 0.2, bz0 + zp(3)), (7.3, 5.6, bz0 + zp(1.5)), 0.012, crane, 14, (0.3, 0, 0))
    for vv in [RUNWAY_D + 0.2 + k * (5.6 - RUNWAY_D - 0.2) / 7 for k in range(8)]:
        frac = (vv - RUNWAY_D - 0.2) / (5.6 - RUNWAY_D - 0.2)
        for uu in (7.3, 7.6):
            rod((uu, vv, bz0), (uu, vv, bz0 + zp(3 - 1.5 * frac)), 0.01, crane, 4)
    box(7.1, RUNWAY_D + 0.25, 0.7, 0.6, DECK + 22.5, 3, mat("#e0e0d8", 0.6))
    box(7.8, RUNWAY_D + 0.35, 0.012, 0.4, DECK + 23.3, 1.4, glass)
    cable = mat("#2a2a2a", 0.5, metal=0.7, grain=0)
    rod((7.45, 4.9, bz0), (7.45, 4.9, zp(DECK + 8)), 0.006, cable, 4)
    box(7.3, 4.75, 0.3, 0.3, DECK + 7, 1, mat("#d8b23a", 0.5, metal=0.3))

    # Containers, a fuel tank, pier-head lights, light masts.
    container(9.0, RUNWAY_D + 0.2, DECK, "#b8432f")
    container(9.0, RUNWAY_D + 0.8, DECK, "#2f6e9c")
    container(9.0, RUNWAY_D + 0.2, DECK + 3, "#c49a2a")
    container(5.7, RUNWAY_D + 0.25, DECK, "#3f7a4a")
    tank = mat("#d8dadc", 0.45, metal=0.35, grain=0.04)
    fuel_tank(W - 1.15, RUNWAY_D + 0.65, 0.45, 18, tank, mat("#55585b", 0.6, metal=0.5, grain=0))
    box(W - 1.62, RUNWAY_D + 1.08, 0.94, 0.012, DECK + 9, 1.4, teamm)
    rod((W - 1.15, RUNWAY_D + 1.1, zp(DECK + 1)), (W - 1.15, QUAY - 0.25, zp(DECK + 1)), 0.03, steel)
    container(9.0, RUNWAY_D + 0.8, DECK + 3, "#9a9c96")
    truck(2.5, QUAY - 0.5, "#c8c4b4")
    truck(8.2, QUAY - 0.45, "#d8b23a")
    # Roof plant on the office, quay-edge lamp posts.
    for k in range(3):
        box(ou + 0.3 + k * 0.6, ov + 0.6, 0.3, 0.25, DECK + 8.8, 1.6, mat("#a0a4a8", 0.5, metal=0.5))
    for u in (3.6, 6.0, 8.4):
        rod((u, QUAY - 0.3, zp(DECK)), (u, QUAY - 0.3, zp(DECK + 9)), 0.012, steel, 6)
        box(u - 0.06, QUAY - 0.36, 0.12, 0.12, DECK + 9, 0.5, mat("#e6e2d0", 0.4))
    for u in (PIER / 2, W - PIER / 2):
        box(u - 0.12, D - 0.3, 0.24, 0.24, DECK, 5, mat("#e8e8e0", 0.6))
        box(u - 0.14, D - 0.32, 0.28, 0.28, DECK + 5, 0.4, steel)
    for u, v in ((0.3, 5.6), (W - 0.3, 5.6)):
        rod((u, v, zp(DECK)), (u, v, zp(DECK + 18)), 0.02, steel, 6)
        box(u - 0.1, v - 0.1, 0.2, 0.2, DECK + 18, 0.8, mat("#e6e2d0", 0.4))
    render(f"port-{faction}", (W, D), 40)


MODELS = {f"port-{f}": (lambda f=f: port(f)) for f in TEAM}

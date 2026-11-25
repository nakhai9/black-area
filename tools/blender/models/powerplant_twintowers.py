"""Power Plant, twin-tower design (4 x 4): two hyperboloid cooling towers, a chimney striped white and in the team
colour, a pump house, on a concrete pad behind a wire fence with a guard post.

Design code (BUILDING_DESIGNS.powerPlant) "twinTowers" (Paxamerica, European Union): ONE render, powerplant-usa; the
game recolours its team line for Europe (PowerPlant.ts DESIGN_PICTURE). Nothing else in the picture may be near the
USA blue hue (the recolour would shift it too): glass is a desaturated grey-blue.
Architecture kept as before (towers at (1.15, 1.0) and (2.85, 1.2), base 0.85, height 80 → lip ≈ 82 where
PowerPlant.ts puts the steam; chimney at (0.75, 2.95); pump house; guard post; fence), with the ART_GUIDE detail pass:
- towers: horizontal formwork rings and vertical precast seams, thickened lip with a walkway railing, aircraft warning
  lights, a maintenance ladder, faint weathering under the lip, raker-column legs with a dark air inlet behind them and
  a water basin rim;
- chimney: steel hoops, a ladder, two platforms with railings, aviation lights, a dark cap lip;
- pump house: framed windows with sills, louvres, a door with a canopy and lamp, membrane roof with joints, a parapet
  coping and vents;
- pad joints both ways; pipes on supports; fence with posts, two rails and mesh; guard post with framed windows, a
  door, a roof coping and the barrier arm on a post.
Team colour (TEAM["usa"], exact): chimney stripes (as before), a band near each tower lip, a band under the pump
house coping, the guard post band (as before).

Own geometry only (kit primitives and materials).
"""
import math

from kit import box, cylinder, lathe, mat, render, rod, zp, TEAM

PAD, SHELL = "#a9aaa6", "#c6c8c4"
TOWERS = [(1.15, 1.0), (2.85, 1.2)]
Z0 = 1.2
H = 80
BASE = 0.85
LEGS = max(5.0, H * 0.07)
GLASS = "#3a444c"  # desaturated: must not be recoloured with the team blue


def radius(t):
    k = abs(t - 0.72) / 0.72
    return BASE * (0.6 + 0.4 * (k**1.6) * (1 if t < 0.72 else 0.55))


def hz(t):
    return Z0 + LEGS + t * (H - LEGS)


def tower(cu, cv, team):
    concrete = mat(SHELL, 0.9, grain=0.1, scale=30)
    seam = mat("#b8bab6", 0.9, grain=0)
    dark = mat("#2a2926", 0.95, grain=0)
    steel = mat("#7c7f83", 0.45, metal=0.7, grain=0)
    prof = [(radius(i / 24), LEGS + i / 24 * (H - LEGS)) for i in range(25)]
    lathe(cu, cv, Z0, prof, concrete, segs=64, thickness=0.035)
    # Dark throat seen from above, and the dark air inlet behind the legs.
    lathe(cu, cv, Z0, [(prof[-1][0] * 0.97, H - 6), (prof[-1][0] * 0.97, H - 0.5)], mat("#3a3834", 0.95, grain=0), segs=64)
    lathe(cu, cv, Z0, [(0, H - 14), (prof[-1][0] * 0.97, H - 14)], dark, segs=64)
    cylinder(cu, cv, BASE * 0.9, Z0, LEGS, dark, 48)
    # Formwork rings and vertical seams, slightly proud of the shell.
    for k in range(1, 7):
        t = k / 7
        z = hz(t)
        lathe(cu, cv, z - 0.15, [(radius(t) + 0.004, 0), (radius(t) + 0.004, 0.3)], seam, segs=64)
    for k in range(24):
        a = 2 * math.pi * k / 24
        prev = None
        for i in range(0, 25, 3):
            t = i / 24
            r = radius(t) + 0.004
            p = (cu + r * math.cos(a), cv + r * math.sin(a), zp(hz(t)))
            if prev:
                rod(prev, p, 0.0022, seam, 4)
            prev = p
    # Weathering under the lip (faint, even), thickened lip, team band, walkway railing, warning lights.
    rl = radius(1.0)
    lathe(cu, cv, H - 9, [(radius(0.9) + 0.003, 0), (rl + 0.003, 7.5)], mat("#b4b5b1", 0.95, grain=0.15, scale=40), segs=64)
    lathe(cu, cv, Z0 + H - 1.4, [(rl + 0.02, 0), (rl + 0.02, 1.6)], concrete, segs=64, thickness=0.04)  # open lip ring
    lathe(cu, cv, Z0 + H - 4.6, [(radius(0.96) + 0.008, 0), (radius(0.98) + 0.008, 2.0)], mat(team, 0.5, grain=0), segs=64)
    for k in range(24):
        a = 2 * math.pi * k / 24
        r = rl + 0.015
        rod((cu + r * math.cos(a), cv + r * math.sin(a), zp(Z0 + H + 0.2)), (cu + r * math.cos(a), cv + r * math.sin(a), zp(Z0 + H + 2.2)), 0.004, steel, 4)
    lathe(cu, cv, Z0 + H + 2.0, [(rl + 0.013, 0), (rl + 0.017, 0.35)], steel, segs=64)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cylinder(cu + (rl + 0.01) * math.cos(a), cv + (rl + 0.01) * math.sin(a), 0.018, Z0 + H + 0.2, 1.0, mat("#ff3b30", 0.3, grain=0, emit="#ff3b30"), 8)
    # Maintenance ladder up the visible (+u, +v) side.
    a = math.pi / 4
    for side in (-0.012, 0.012):
        prev = None
        for i in range(0, 25, 2):
            t = i / 24
            r = radius(t) + 0.014
            p = (cu + r * math.cos(a) - side * math.sin(a), cv + r * math.sin(a) + side * math.cos(a), zp(hz(t)))
            if prev:
                rod(prev, p, 0.0025, steel, 4)
            prev = p
    for i in range(24):
        t = i / 24
        r = radius(t) + 0.014
        c, s = cu + r * math.cos(a), cv + r * math.sin(a)
        rod((c - 0.012 * math.sin(a), s + 0.012 * math.cos(a), zp(hz(t))), (c + 0.012 * math.sin(a), s - 0.012 * math.cos(a), zp(hz(t))), 0.002, steel, 4)
    # Raker-column legs (crossed pairs), basin rim.
    leg = mat(SHELL, 0.9, grain=0.08)
    n = 28
    for i in range(n):
        a0 = 2 * math.pi * i / n
        for sg in (1, -1):
            b = a0 + sg * 0.16
            rod((cu + BASE * math.cos(a0), cv + BASE * math.sin(a0), zp(Z0)), (cu + BASE * math.cos(b), cv + BASE * math.sin(b), zp(Z0 + LEGS)), 0.016, leg, 6)
        box(cu + BASE * math.cos(a0) - 0.025, cv + BASE * math.sin(a0) - 0.025, 0.05, 0.05, Z0, 0.6, leg)
    cylinder(cu, cv, BASE + 0.07, Z0, 1.1, mat(PAD, 0.9, grain=0.1), 64)
    cylinder(cu, cv, BASE + 0.02, Z0 + 0.4, 0.8, mat("#4c5a5c", 0.15, grain=0.05), 64)  # water in the basin


def chimney(team):
    cu, cv = 0.75, 2.95
    steel = mat("#6c6f73", 0.45, metal=0.7, grain=0)
    bands = 7
    for i in range(bands):
        r = 0.17 * (1 - i * 0.03)
        cylinder(cu, cv, r, 1.2 + i * 96 / bands, 96 / bands, mat("#f2f0ea" if i % 2 else team, 0.6, grain=0.05))
    for i in range(1, bands):
        cylinder(cu, cv, 0.17 * (1 - i * 0.03) + 0.006, 1.2 + i * 96 / bands - 0.3, 0.6, steel, 32)  # hoops
    cylinder(cu, cv, 0.155, 96.6, 0.8, steel, 32)
    cylinder(cu, cv, 0.15, 97.2, 1.5, mat("#3a3834", 0.9, grain=0), 32)
    for z, r in ((40, 0.17 * (1 - 3 * 0.03)), (82, 0.17 * (1 - 5 * 0.03))):  # platforms with railings
        cylinder(cu, cv, r + 0.05, z, 0.5, steel, 32)
        for k in range(16):
            a = 2 * math.pi * k / 16
            rod((cu + (r + 0.048) * math.cos(a), cv + (r + 0.048) * math.sin(a), zp(z + 0.5)), (cu + (r + 0.048) * math.cos(a), cv + (r + 0.048) * math.sin(a), zp(z + 2.4)), 0.003, steel, 4)
        lathe(cu, cv, z + 2.3, [(r + 0.046, 0), (r + 0.05, 0.3)], steel, segs=32)
        for a in (math.pi / 4, 5 * math.pi / 4):
            cylinder(cu + (r + 0.03) * math.cos(a), cv + (r + 0.03) * math.sin(a), 0.016, z + 0.5, 0.9, mat("#ff3b30", 0.3, grain=0, emit="#ff3b30"), 8)
    a = math.pi / 4  # ladder
    for i, side in enumerate((-0.012, 0.012)):
        rod((cu + 0.18 * math.cos(a) - side * math.sin(a), cv + 0.18 * math.sin(a) + side * math.cos(a), zp(2)), (cu + 0.15 * math.cos(a) - side * math.sin(a), cv + 0.15 * math.sin(a) + side * math.cos(a), zp(97)), 0.0025, steel, 4)
    for k in range(48):
        z = 2 + k * 2
        r = 0.18 - 0.03 * k / 48
        c, s = cu + r * math.cos(a), cv + r * math.sin(a)
        rod((c - 0.012 * math.sin(a), s + 0.012 * math.cos(a), zp(z)), (c + 0.012 * math.sin(a), s - 0.012 * math.cos(a), zp(z)), 0.002, steel, 4)
    cylinder(cu, cv, 0.008, 98.7, 4, steel, 6)  # lightning rod


def pump_house(team):
    u, v, w, d, h = 1.2, 2.55, 1.0, 0.75, 12
    wall = mat("#d4d2ca", 0.85, grain=0.06)
    trim = mat("#e8e6de", 0.7, grain=0.03)
    glass = mat(GLASS, 0.1, grain=0, glass=True)
    dark = mat("#3a3c3e", 0.6, metal=0.4, grain=0)
    box(u, v, w, d, 1.2, h, wall, bevel=0.01)
    box(u - 0.01, v - 0.01, w + 0.02, d + 0.02, 1.2, 1.4, mat("#9c9a92", 0.9, grain=0.1))  # plinth
    for k in range(1, 4):  # panel joints
        box(u + k * w / 4 - 0.003, v + d, 0.006, 0.004, 2.6, h - 1.4, mat("#b8b6ae", 0.9, grain=0))
        box(u + w, v + k * d / 4 - 0.003, 0.004, 0.006, 2.6, h - 1.4, mat("#b8b6ae", 0.9, grain=0))
    box(u - 0.012, v - 0.012, w + 0.024, d + 0.024, 1.2 + h - 1.8, 0.8, mat(team, 0.5, grain=0))  # team band
    box(u - 0.02, v - 0.02, w + 0.04, d + 0.04, 1.2 + h, 1.2, mat("#6e706c", 0.7))  # coping
    box(u + 0.02, v + 0.02, w - 0.04, d - 0.04, 1.2 + h, 1.25, mat("#55575a", 0.95, grain=0.15, scale=30))  # membrane
    for k in range(1, 5):
        box(u + 0.02 + k * (w - 0.04) / 5 - 0.003, v + 0.02, 0.006, d - 0.04, 1.2 + h + 1.25, 0.05, mat("#6a6c6e", 0.9, grain=0))
    for k in range(1, 3):
        box(u + 0.02, v + 0.02 + k * (d - 0.04) / 3 - 0.003, w - 0.04, 0.006, 1.2 + h + 1.25, 0.05, mat("#6a6c6e", 0.9, grain=0))
    for cu, cv in ((u + 0.25, v + 0.25), (u + 0.7, v + 0.45)):  # vents
        cylinder(cu, cv, 0.03, 1.2 + h + 1.3, 1.8, mat("#9aa0a6", 0.4, metal=0.7, grain=0), 12)
        lathe(cu, cv, 1.2 + h + 3.1, [(0.055, 0), (0.0, 0.9)], mat("#80868c", 0.4, metal=0.7, grain=0), 12, cap_bottom=True)
    box(u + 0.45, v + 0.15, 0.3, 0.2, 1.2 + h + 1.3, 2.2, mat("#b8bcbe", 0.6, metal=0.3))  # AC unit
    for k in range(6):
        box(u + 0.47 + k * 0.045, v + 0.35, 0.025, 0.004, 1.2 + h + 1.6, 1.6, dark)
    for k in range(4):  # front windows: recessed glass, frame, lintel, sill
        s0 = u + 0.1 + k * 0.22
        box(s0, v + d, 0.12, 0.006, 5, 4, glass)
        for x in (s0 - 0.012, s0 + 0.12):
            box(x, v + d, 0.012, 0.018, 5, 4, trim)
        box(s0 - 0.012, v + d, 0.144, 0.02, 9, 0.5, trim)
        box(s0 - 0.02, v + d, 0.16, 0.03, 4.5, 0.5, trim)
        box(s0 + 0.058, v + d, 0.004, 0.012, 5, 4, trim)
    for k in range(3):  # louvres on the side
        for j in range(5):
            box(u + w, v + 0.12 + k * 0.2, 0.012, 0.12, 4 + j * 1.2, 0.5, dark)
    # Side door with canopy and lamp.
    box(u + w, v + 0.62, 0.008, 0.1, 1.2, 6, dark)
    box(u + w, v + 0.6, 0.07, 0.14, 7.4, 0.5, mat("#6e706c", 0.7))
    box(u + w + 0.008, v + 0.66, 0.01, 0.02, 8.2, 0.8, mat("#f4e7b0", 0.3, grain=0, emit="#ffe6a0"))


def pipes():
    pipe = mat("#8a8d90", 0.4, metal=0.8, grain=0.03)
    sup = mat("#6c6f73", 0.5, metal=0.6, grain=0)
    for a, b in (((1.7, 2.55), (1.4, 1.6)), ((2.2, 2.9), (2.8, 2.0))):
        rod((a[0], a[1], zp(6)), (b[0], b[1], zp(6)), 0.04, pipe)
        for t in (0.25, 0.6):  # supports
            pu, pv = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            box(pu - 0.02, pv - 0.02, 0.04, 0.04, 1.2, 4.2, sup)
            cylinder(pu, pv, 0.046, 5.4, 1.2, sup, 12)


def fence():
    post = mat("#5c5f62", 0.6, metal=0.5, grain=0)
    rail = mat("#96999e", 0.5, metal=0.6, grain=0)
    mesh = mat("#8e9196", 0.6, metal=0.5, grain=0)
    e0, e1, fz, fh = 0.12, 3.88, zp(1.2), zp(7)
    for a, b in [((e0, e0), (e1, e0)), ((e0, e0), (e0, e1)), ((e0, e1), (e1, e1)), ((e1, e0), (e1, e1))]:
        n = round(math.dist(a, b) / 0.32)
        for i in range(n + 1):
            u = a[0] + (b[0] - a[0]) * i / n
            v = a[1] + (b[1] - a[1]) * i / n
            rod((u, v, fz), (u, v, fz + fh), 0.008, post, 4)
        for zz in (fz + fh * 0.05, fz + fh * 0.45, fz + fh):
            rod((a[0], a[1], zz), (b[0], b[1], zz), 0.005, rail, 4)
        m = round(math.dist(a, b) / 0.06)  # mesh wires
        for i in range(m + 1):
            u = a[0] + (b[0] - a[0]) * i / m
            v = a[1] + (b[1] - a[1]) * i / m
            rod((u, v, fz + fh * 0.05), (u, v, fz + fh), 0.0015, mesh, 3)


def guard_post(team):
    wall = mat("#d9d6cc", 0.85, grain=0.05)
    trim = mat("#e8e6de", 0.7, grain=0.03)
    glass = mat(GLASS, 0.1, grain=0, glass=True)
    box(3.15, 3.15, 0.55, 0.55, 1.2, 13, wall, bevel=0.01)
    box(3.14, 3.14, 0.57, 0.57, 1.2, 1.4, mat("#9c9a92", 0.9, grain=0.1))
    box(3.11, 3.11, 0.63, 0.63, 14.2, 1, mat("#6e706c", 0.7))
    box(3.15, 3.15, 0.55, 0.555, 12.3, 1.2, mat(team, 0.5, grain=0))
    box(3.2, 3.7, 0.45, 0.01, 6.5, 4.5, glass)
    box(3.7, 3.2, 0.01, 0.45, 6.5, 4.5, glass)
    for x in (3.19, 3.41, 3.64):  # mullions and sills
        box(x, 3.7, 0.012, 0.02, 6.5, 4.5, trim)
        box(3.7, x, 0.02, 0.012, 6.5, 4.5, trim)
    box(3.18, 3.7, 0.49, 0.035, 6.0, 0.5, trim)
    box(3.7, 3.18, 0.035, 0.49, 6.0, 0.5, trim)
    box(3.22, 3.22, 0.41, 0.41, 15.2, 0.2, mat("#55575a", 0.95, grain=0.15, scale=30))  # roof membrane
    box(3.25, 3.7, 0.12, 0.008, 1.2, 4.6, mat("#3a3c3e", 0.6, metal=0.4, grain=0))  # door (front, beside the window)
    # Barrier arm on its post.
    box(2.55, 3.43, 0.06, 0.06, 1.2, 5, mat("#5c5f62", 0.6, metal=0.5, grain=0))
    for k in range(5):
        box(2.6 + k * 0.1, 3.45, 0.1, 0.03, 5.2, 0.6, mat("#d8262b" if k % 2 == 0 else "#f2f0ea", 0.5, grain=0))


def power_plant_usa():
    team = TEAM["usa"]
    pad = mat(PAD, 0.95, grain=0.15, scale=8)
    box(0.04, 0.04, 3.92, 3.92, 0, 1.2, pad)
    joint = mat("#8e8f8b", 0.95, grain=0)
    for k in range(1, 8):
        box(0.04 + k * 3.92 / 8 - 0.004, 0.04, 0.008, 3.92, 1.2, 0.05, joint)
        box(0.04, 0.04 + k * 3.92 / 8 - 0.004, 3.92, 0.008, 1.2, 0.05, joint)
    for cu, cv in TOWERS:
        tower(cu, cv, team)
    chimney(team)
    pump_house(team)
    pipes()
    fence()
    guard_post(team)
    render("powerplant-usa", (4, 4), 100)


MODELS = {"powerplant-usa": power_plant_usa}

from models._utilwreck import variant  # noqa: E402

for _d in (1, 2, 3):
    MODELS[f"powerplant-usa-d{_d}"] = (lambda d=_d: variant(globals(), power_plant_usa, d, side=(1.0, 0.4), stub=7, frag=22))

"""Nordursia Reserve Capital (3 x 4): after the Ministry of Foreign Affairs on Smolenskaya Square (Moscow).

Layout as in the photos, front on +u:
- a slender central tower shaft of ochre stone, many times taller than wide, ribbed all the way up with dense
  vertical pilaster strips and dark window bays between them;
- its crown: a cornice, four corner pylons with pinnacles, the state emblem on each visible face, a crenellated
  parapet, a smaller pinnacled stage, a lantern stage with tall windows and a slim ribbed spire with a gold tip;
- a lower tower on each side (along v), ribbed the same way, crenellated with corner pinnacles;
- a low base block joining them with the entrance portal in the middle;
- two separate forward blocks at the front corners round the forecourt, with giant pilasters, a cornice and an attic.
Flat tops carry crenellations, pinnacles, parapets and paving joints (no bare roof face).
Team colour (TEAM["russia"]): bands under the cornices of the shaft, the side towers and the forward blocks.

Plot: u 0..3 (front +u), v 0..4. Own geometry only (kit primitives and materials).
"""
import math

from kit import box, cylinder, lathe, mat, render, rod, roof, zp, TEAM

W, D = 3, 4


def ribbed(u0, v0, w, d, z, h, stone, rib, bay, n_v, n_u, frame=None):
    """Block faced like the Moscow high-rises on its two visible faces (+u, +v): light pilaster ribs running up between
    the bays, an individual window per bay and floor (sill and dark glass), and a white string course every 8 floors."""
    box(u0, v0, w, d, z, h, stone)
    floors = max(1, int((h - 1) // 3.2))
    trim = frame if frame is not None else rib
    for k in range(n_v):  # +u face windows
        c = v0 + (k + 0.5) * d / n_v
        for f in range(floors):
            zz = z + 0.9 + f * 3.2
            box(u0 + w, c - d / n_v * 0.22, 0.008, d / n_v * 0.44, zz, 1.9, bay)
            box(u0 + w, c - d / n_v * 0.27, 0.014, d / n_v * 0.54, zz - 0.3, 0.3, trim)
    for k in range(n_v + 1):
        box(u0 + w, v0 + k * d / n_v - 0.012, 0.022, 0.024, z, h, rib)
    for k in range(n_u):  # +v face windows
        c = u0 + (k + 0.5) * w / n_u
        for f in range(floors):
            zz = z + 0.9 + f * 3.2
            box(c - w / n_u * 0.22, v0 + d, w / n_u * 0.44, 0.008, zz, 1.9, bay)
            box(c - w / n_u * 0.27, v0 + d, w / n_u * 0.54, 0.014, zz - 0.3, 0.3, trim)
    for k in range(n_u + 1):
        box(u0 + k * w / n_u - 0.012, v0 + d, 0.024, 0.022, z, h, rib)
    white = mat("#ece3cf", 0.7, grain=0.04)
    for f in range(8, floors, 8):  # string courses
        zz = z + f * 3.2 - 0.4
        box(u0 - 0.005, v0 - 0.005, w + 0.035, d + 0.035, zz, 0.7, white)


def crown(u0, v0, w, d, z, stone, stone_d, team, pinnacle=True, pylon=0.0, merlons=True):
    """Cornice, team band, crenellated parapet and corner pinnacles on top of a block; returns the parapet top z."""
    box(u0 + w + 0.01, v0, 0.012, d, z - 1.6, 0.8, team)
    box(u0, v0 + d + 0.01, w, 0.012, z - 1.6, 0.8, team)
    box(u0 - 0.03, v0 - 0.03, w + 0.06, d + 0.06, z, 1.0, stone_d)
    box(u0 - 0.02, v0 - 0.02, w + 0.04, d + 0.04, z + 1.0, 1.0, stone)
    n_v, n_u = max(3, round(d / 0.08)), max(3, round(w / 0.08))
    for k in range(n_v if merlons else 0):  # merlons on all four edges
        c = v0 + (k + 0.5) * d / n_v
        for uu in (u0 + w - 0.02, u0 - 0.02):
            box(uu, c - 0.018, 0.04, 0.036, z + 2.0, 1.4, stone)
    for k in range(n_u if merlons else 0):
        c = u0 + (k + 0.5) * w / n_u
        for vv in (v0 + d - 0.02, v0 - 0.02):
            box(c - 0.018, vv, 0.036, 0.04, z + 2.0, 1.4, stone)
    joint = mat("#a3916f", 0.85, grain=0)
    for k in range(1, max(2, round(d / 0.2))):
        box(u0 + 0.03, v0 + d * k / max(2, round(d / 0.2)) - 0.008, w - 0.06, 0.016, z + 2.0, 0.2, joint)
    if pinnacle:
        s = pylon or 0.07
        for cu, cv in ((u0, v0), (u0 + w, v0), (u0, v0 + d), (u0 + w, v0 + d)):
            box(cu - s / 2, cv - s / 2, s, s, z, 3.6 + (8 if pylon else 0), stone)
            zt = z + 3.6 + (8 if pylon else 0)
            box(cu - s / 2 - 0.01, cv - s / 2 - 0.01, s + 0.02, s + 0.02, zt, 0.6, stone_d)
            lathe(cu, cv, zt + 0.6, [(s * 0.45, 0), (0.0, 5 if pylon else 3.5)], stone_d, segs=4)
            cylinder(cu, cv, 0.006, zt + (5.6 if pylon else 4.1), 1.2, mat("#d4af4f", 0.3, metal=0.9, grain=0), 6)
    return z + 3.4


def emblem(face, at, c, z, gold, team):
    """State emblem (round wreath with the arms) on a visible face: gold ring, team field."""
    if face == "u":
        box(at, c - 0.09, 0.012, 0.18, z, 6.0, gold)
        box(at + 0.006, c - 0.06, 0.012, 0.12, z + 1.0, 4.0, team)
    else:
        box(c - 0.09, at, 0.18, 0.012, z, 6.0, gold)
        box(c - 0.06, at + 0.006, 0.12, 0.012, z + 1.0, 4.0, team)


def reserve_capital_russia():
    team = mat(TEAM["russia"], 0.5, grain=0)
    stone = mat("#cdb48a", 0.75, grain=0.1, scale=24)  # ochre facing stone
    stone_d = mat("#b39a72", 0.8, grain=0.1, scale=24)
    rib = mat("#d8c39c", 0.75, grain=0.06, scale=24)
    bay = mat("#55524c", 0.45, grain=0.05)  # window bays (glass and dark spandrels read as one at sprite size)
    frame = mat("#a8916c", 0.8, grain=0)
    gold = mat("#d4af4f", 0.28, metal=0.9, grain=0)
    glass = mat("#3b4f62", 0.08, grain=0, glass=True)
    granite = mat("#6e5a52", 0.7, grain=0.1, scale=30)
    paving = mat("#8f8a82", 0.85, grain=0.12)

    box(0, 0, W, D, 0, 1, paving)  # forecourt (sunk flush by kit.render)
    box(0.25, 0.35, 1.85, 3.3, 1, 1.2, granite)  # granite base course

    # Low base block joining the towers, entrance portal in the middle.
    ribbed(0.3, 0.45, 1.7, 3.1, 2.2, 16, stone, rib, bay, 16, 9, frame)
    crown(0.3, 0.45, 1.7, 3.1, 18.2, stone, stone_d, team, pinnacle=False, merlons=False)
    box(2.0, 1.72, 0.18, 0.56, 1, 9, stone_d)  # portal frame
    box(2.18, 1.8, 0.01, 0.4, 1, 7, bay)
    for k in range(4):
        cylinder(2.16, 1.78 + k * 0.44 / 3, 0.022, 1, 7.6, rib, 10)
    box(2.0, 1.7, 0.2, 0.6, 9.6, 1.2, stone)
    for k in range(3):
        box(2.2 + k * 0.08, 1.75 + k * 0.03, 0.08, 0.5 - k * 0.06, 1, 1.0 - k * 0.3, stone_d)

    # Side towers (lower), each side of the shaft along v: a lower stage and an inset upper stage, each crowned.
    for v0 in (0.85, 2.55):
        ribbed(0.75, v0, 1.15, 0.6, 2.2, 36, stone, rib, bay, 6, 11, frame)
        crown(0.75, v0, 1.15, 0.6, 38.2, stone, stone_d, team)
        ribbed(0.95, v0 + 0.1, 0.75, 0.4, 41.6, 14, stone, rib, bay, 4, 7, frame)
        pz_ = crown(0.95, v0 + 0.1, 0.75, 0.4, 55.6, stone, stone_d, team)
        lathe(1.32, v0 + 0.3, pz_, [(0.12, 0), (0.1, 1.5), (0.0, 7)], stone_d, segs=4)  # obelisk crown
        cylinder(1.32, v0 + 0.3, 0.006, pz_ + 7, 2, gold, 6)

    # Central shaft: slender and very tall.
    su0, sv0, sw, sd = 0.85, 1.45, 1.05, 1.1
    z_top = 84
    ribbed(su0, sv0, sw, sd, 2.2, z_top - 2.2, stone, rib, bay, 11, 10, frame)
    pz = crown(su0, sv0, sw, sd, z_top, stone, stone_d, team, pylon=0.14)
    emblem("u", su0 + sw + 0.02, sv0 + sd / 2, z_top - 9, gold, team)
    emblem("v", sv0 + sd + 0.02, su0 + sw / 2, z_top - 9, gold, team)

    # Second stage with pinnacles, an octagonal lantern with columns, a gilded band and the needle spire.
    a0, b0, aw, bd = su0 + 0.22, sv0 + 0.24, sw - 0.44, sd - 0.48
    ribbed(a0, b0, aw, bd, pz, 9, stone, rib, bay, 5, 5)
    pz2 = crown(a0, b0, aw, bd, pz + 9, stone, stone_d, team)
    cu, cv = a0 + aw / 2, b0 + bd / 2
    lathe(cu, cv, pz2, [(0.2, 0), (0.2, 1.2)], stone_d, segs=8, cap_top=True)
    lathe(cu, cv, pz2 + 1.2, [(0.16, 0), (0.16, 9)], glass, segs=8, cap_top=True)
    for k in range(8):
        ang = 2 * math.pi * (k + 0.5) / 8
        cylinder(cu + 0.17 * math.cos(ang), cv + 0.17 * math.sin(ang), 0.014, pz2 + 1.2, 9, rib, 8)
    lathe(cu, cv, pz2 + 10.2, [(0.2, 0), (0.2, 1.0)], gold, segs=8, cap_top=True)
    lathe(cu, cv, pz2 + 11.2, [(0.17, 0), (0.15, 2.2)], stone_d, segs=8, cap_top=True)
    zs = pz2 + 13.4
    lathe(cu, cv, zs, [(0.14, 0), (0.1, 6), (0.07, 12), (0.035, 22), (0.0, 32)], stone_d, segs=8)
    for k in range(8):  # gilded ribs on every face of the spire
        ang = 2 * math.pi * k / 8
        prev = None
        for r, hz in ((0.14, 0), (0.1, 6), (0.07, 12), (0.035, 22), (0.0, 32)):
            pt = (cu + (r + 0.004) * math.cos(ang), cv + (r + 0.004) * math.sin(ang), zp(zs + hz))
            if prev:
                rod(prev, pt, 0.004, gold)
            prev = pt
    for hz, r in ((6, 0.105), (12, 0.075)):
        lathe(cu, cv, zs + hz - 0.4, [(r, 0), (r, 0.8)], gold, segs=8)
    lathe(cu, cv, zs + 32, [(0.012, 0), (0.025, 1.2), (0.006, 2.4), (0.0, 5)], gold, segs=12)

    # Forward blocks at the front corners round the forecourt: rusticated granite ground floor, giant columns on the
    # front, cornice and an attic with a relief panel.
    for v0 in (0.12, 3.03):
        box(1.95, v0, 0.9, 0.85, 1, 5, granite)
        for k in (2.2, 3.6):
            box(2.85, v0, 0.01, 0.85, k, 0.25, stone_d)
            box(1.95, v0 + 0.85, 0.9, 0.01, k, 0.25, stone_d)
        ribbed(1.95, v0, 0.9, 0.85, 6, 15, stone, rib, bay, 7, 7, frame)
        for k in range(4):
            cylinder(2.88, v0 + 0.15 + k * 0.55 / 3, 0.028, 6, 14, rib, 12)
        box(2.85, v0 + 0.1, 0.06, 0.65, 20, 1.0, stone_d)
        crown(1.95, v0, 0.9, 0.85, 21, stone, stone_d, team, pinnacle=False, merlons=False)
        box(2.1, v0 + 0.1, 0.65, 0.65, 24.4, 3.2, stone)  # attic
        box(2.751, v0 + 0.25, 0.012, 0.35, 25, 2, gold)  # relief panel
        for k in range(1, 4):
            box(2.1, v0 + 0.1 + k * 0.65 / 4 - 0.008, 0.65, 0.016, 27.6, 0.2, stone_d)

    render("reservecapital-russia", (W, D), 140)


MODELS = {"reservecapital-russia": reserve_capital_russia}

"""USA High-Tech Center (5 × 5): Apple Park — a five-storey glass ring: each floor a white slab whose edge runs out as a
thin canopy over the curved glass wall, a dark solar roof with an overhanging white rim and four glazed skylight
bands, a wooded courtyard inside, a paved ring round the outside.

ART_GUIDE detail pass (architecture unchanged): a transom and a dark shadow line under every slab canopy, the solar roof
as a visible photovoltaic grid (radial and ring seams over the whole roof), skylight bands with white side rails and
cross ribs, a maintenance rail on the roof rim, four glass entrance lobbies with canopies, paving joints on both paved
rings, a stone rim round the pond, a path ring through the orchard, and trees as real trees (tapering trunks, irregular
clumps of two greens). Team colour (TEAM["usa"]): a band along the roof rim fascia and the line under the rim.
"""
import math
import random

from models._damage import ruined_render
from kit import box, dome, lathe, mat, render, rod, zp, TEAM

CU = CV = 2.5
R_OUT, R_IN = 2.25, 1.6
FLOOR = 7.0
FLOORS = 5


def ring(r0, r1, z, h, material, segs=128):
    """Solid annulus round the plot centre from radius r0 to r1 (tiles), z up h (art px)."""
    return lathe(CU, CV, z, [(r0, 0), (r1, 0), (r1, h), (r0, h), (r0, 0)], material, segs)


def tree(rng, u, v, z, s, leaves, trunk):
    """Orchard tree: a tapering, slightly leaning trunk, two branches and a canopy of irregular leaf clumps."""
    lean = (rng.uniform(-0.015, 0.015), rng.uniform(-0.015, 0.015))
    top = (u + lean[0], v + lean[1], zp(z + 4 * s))
    lathe(u, v, z, [(0.016 * s, 0), (0.009 * s, 4 * s)], trunk, 6, cap_bottom=True)
    for k in range(2):
        a = rng.uniform(0, 2 * math.pi)
        rod((u, v, zp(z + 2.6 * s)), (u + math.cos(a) * 0.05 * s, v + math.sin(a) * 0.05 * s, zp(z + 4.6 * s)), 0.004 * s, trunk, 4)
    for k in range(rng.randint(4, 6)):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0.0, 0.055) * s
        r = rng.uniform(0.045, 0.075) * s
        dome(top[0] + math.cos(a) * d, top[1] + math.sin(a) * d, r, z + rng.uniform(3.0, 5.5) * s, rng.uniform(4.5, 7.0) * s,
             leaves[k % 2] if rng.random() < 0.7 else leaves[(k + 1) % 2], segs=9, rings=4)


def apple_park(damage=0):
    rng = random.Random(7)
    glass = mat("#5d7488", 0.08, grain=0, glass=True)
    white = mat("#eef0ee", 0.5, grain=0.03)
    solar = mat("#1d2733", 0.25, metal=0.4, grain=0.04, scale=60)
    sky = mat("#a9c3d6", 0.1, grain=0, glass=True)
    lawn = mat("#4f7b35", 0.95, grain=0.3, scale=25)
    pave = mat("#c9c6be", 0.95, grain=0.1, scale=10)
    leaf = mat("#3e6b2c", 0.9, grain=0.35, scale=30)
    leaf2 = mat("#577f34", 0.9, grain=0.35, scale=30)
    trunk = mat("#5a4632", 0.9, grain=0)
    team = mat(TEAM["usa"], 0.5, grain=0)
    shadow = mat("#3a3f45", 0.8, grain=0)
    seam = mat("#3a4a5c", 0.3, metal=0.5, grain=0)
    joint = mat("#9e9b93", 0.95, grain=0)
    rail = mat("#c8ccd0", 0.4, metal=0.7, grain=0)

    # Paved ring round the building and round the courtyard (no lawn or trees outside: the map's ground shows).
    ring(R_OUT - 0.05, R_OUT + 0.18, 1, 0.1, pave)
    ring(R_IN - 0.15, R_IN + 0.05, 1, 0.1, pave)
    ring(0, R_IN - 0.15, 1, 0.1, lawn)
    for i in range(72):  # paving joints, outer ring
        a = 2 * math.pi * i / 72
        rod((CU + (R_OUT - 0.05) * math.cos(a), CV + (R_OUT - 0.05) * math.sin(a), zp(1.12)), (CU + (R_OUT + 0.18) * math.cos(a), CV + (R_OUT + 0.18) * math.sin(a), zp(1.12)), 0.003, joint, 4)
    for i in range(48):  # and the courtyard ring
        a = 2 * math.pi * i / 48
        rod((CU + (R_IN - 0.15) * math.cos(a), CV + (R_IN - 0.15) * math.sin(a), zp(1.12)), (CU + (R_IN + 0.05) * math.cos(a), CV + (R_IN + 0.05) * math.sin(a), zp(1.12)), 0.003, joint, 4)
    ring(0.95, 1.05, 1.1, 0.06, pave)  # path ring through the orchard
    ring(0.35, 0.4, 1, 0.5, pave)  # stone rim round the pond

    # Five floors: glass wall set back between white slabs that cantilever out as canopies on both sides.
    for k in range(FLOORS):
        z = 1 + k * FLOOR
        ring(R_IN - 0.07, R_OUT + 0.07, z, 1.0, white)
        ring(R_IN + 0.03, R_OUT - 0.03, z + 1.0, FLOOR - 1.0, glass)
        ring(R_OUT - 0.032, R_OUT - 0.02, z + 1.0 + (FLOOR - 1.0) * 0.72, 0.25, white)  # transom
        ring(R_IN + 0.02, R_IN + 0.032, z + 1.0 + (FLOOR - 1.0) * 0.72, 0.25, white)
        if k:  # shadow line under the canopy edge
            ring(R_OUT + 0.03, R_OUT + 0.06, z - 0.25, 0.25, shadow)
        # Mullions on the outer wall.
        n = 96
        for i in range(n):
            a = 2 * math.pi * i / n
            for r in (R_OUT - 0.025, R_IN + 0.025):
                u, v = CU + r * math.cos(a), CV + r * math.sin(a)
                rod((u, v, zp(z + 1)), (u, v, zp(z + FLOOR)), 0.004, white, 4)
    top = 1 + FLOORS * FLOOR
    # Roof: white rim overhanging both edges, dark solar panels, four glazed skylight bands across the ring.
    ring(R_IN - 0.12, R_OUT + 0.12, top, 1.2, white)
    ring(R_IN - 0.02, R_OUT + 0.02, top + 1.2, 0.4, solar)
    # Photovoltaic grid over the whole roof: radial seams and ring seams.
    for i in range(240):
        a = 2 * math.pi * i / 240
        rod((CU + (R_IN + 0.0) * math.cos(a), CV + (R_IN + 0.0) * math.sin(a), zp(top + 1.65)), (CU + R_OUT * math.cos(a), CV + R_OUT * math.sin(a), zp(top + 1.65)), 0.0025, seam, 4)
    for k in range(1, 8):
        r = R_IN + (R_OUT - R_IN) * k / 8
        ring(r - 0.003, r + 0.003, top + 1.6, 0.08, seam)
    # Maintenance rail on the roof rim, inner and outer.
    for r in (R_OUT + 0.08, R_IN - 0.08):
        n = int(2 * math.pi * r / 0.09)
        for i in range(n):
            a = 2 * math.pi * i / n
            rod((CU + r * math.cos(a), CV + r * math.sin(a), zp(top + 1.2)), (CU + r * math.cos(a), CV + r * math.sin(a), zp(top + 2.6)), 0.003, rail, 4)
        ring(r - 0.004, r + 0.004, top + 2.6, 0.2, rail)
    for a0 in (0.25, 1.82, 3.39, 4.96):
        for i in range(6):
            a = a0 + i * 0.03
            p0 = (CU + (R_IN + 0.08) * math.cos(a), CV + (R_IN + 0.08) * math.sin(a), zp(top + 1.7))
            p1 = (CU + (R_OUT - 0.08) * math.cos(a), CV + (R_OUT - 0.08) * math.sin(a), zp(top + 1.7))
            rod(p0, p1, 0.02, sky, 4)
        for a in (a0 - 0.025, a0 + 5 * 0.03 + 0.025):  # white side rails of the band
            rod((CU + (R_IN + 0.06) * math.cos(a), CV + (R_IN + 0.06) * math.sin(a), zp(top + 1.8)), (CU + (R_OUT - 0.06) * math.cos(a), CV + (R_OUT - 0.06) * math.sin(a), zp(top + 1.8)), 0.012, white, 6)
        for k in range(1, 6):  # cross ribs
            r = R_IN + 0.08 + (R_OUT - R_IN - 0.16) * k / 6
            rod((CU + r * math.cos(a0 - 0.02), CV + r * math.sin(a0 - 0.02), zp(top + 1.95)), (CU + r * math.cos(a0 + 0.17), CV + r * math.sin(a0 + 0.17), zp(top + 1.95)), 0.005, white, 4)
    # A thin team-colour line under the roof rim.
    ring(R_OUT + 0.11, R_OUT + 0.125, top - 0.4, 0.4, team)
    ring(R_OUT + 0.12, R_OUT + 0.132, top + 0.2, 0.8, team)  # team band on the rim fascia

    # Four glass entrance lobbies on the outer paved ring, each under a white canopy.
    for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
        r = R_OUT + 0.09
        u, v = CU + r * math.cos(a), CV + r * math.sin(a)
        box(u - 0.06, v - 0.06, 0.12, 0.12, 1, 4.5, glass)
        box(u - 0.08, v - 0.08, 0.16, 0.16, 5.5, 0.4, white)
        for du, dv in ((-0.06, -0.06), (0.06, -0.06), (-0.06, 0.06), (0.06, 0.06)):
            rod((u + du, v + dv, zp(1)), (u + du, v + dv, zp(5.5)), 0.004, rail, 4)

    # Wooded courtyard: a pond and orchard trees inside the ring.
    lathe(CU, CV, 1, [(0, 0), (0.35, 0), (0.35, 0.15), (0, 0.15)], mat("#3d6a86", 0.05, grain=0, glass=True), 48)
    for _ in range(60):
        a, r = rng.uniform(0, 2 * math.pi), rng.uniform(0.45, R_IN - 0.25)
        if abs(r - 1.0) < 0.07:
            continue  # keep the path ring clear
        tree(rng, CU + r * math.cos(a), CV + r * math.sin(a), 1, rng.uniform(0.8, 1.2), (leaf, leaf2) if rng.random() < 0.6 else (leaf2, leaf), trunk)
    ruined_render("techcenter-usa-applepark", (5, 5), top + 12, damage, seed=23, cut_u=2.5)


MODELS = {"techcenter-usa-applepark": apple_park, **{f"techcenter-usa-applepark-d{d}": (lambda d=d: apple_park(d)) for d in (1, 2, 3)}}

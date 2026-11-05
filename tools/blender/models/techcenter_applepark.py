"""USA High-Tech Center (5 × 5): Apple Park — a five-storey glass ring: each floor a white slab whose edge runs out as a
thin canopy over the curved glass wall, a dark solar roof with an overhanging white rim and four glazed skylight
bands, a wooded courtyard inside, a paved ring round the outside."""
import math
import random

from kit import dome, lathe, mat, render, rod, zp, TEAM

CU = CV = 2.5
R_OUT, R_IN = 2.25, 1.6
FLOOR = 7.0
FLOORS = 5


def ring(r0, r1, z, h, material, segs=128):
    """Solid annulus round the plot centre from radius r0 to r1 (tiles), z up h (art px)."""
    return lathe(CU, CV, z, [(r0, 0), (r1, 0), (r1, h), (r0, h), (r0, 0)], material, segs)


def tree(u, v, z, s, leaf, trunk):
    rod((u, v, zp(z)), (u, v, zp(z + 4 * s)), 0.012 * s, trunk, 5)
    dome(u, v, 0.11 * s, z + 3 * s, 9 * s, leaf, segs=10, rings=5)


def apple_park():
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

    # Paved ring round the building and round the courtyard (no lawn or trees outside: the map's ground shows).
    ring(R_OUT - 0.05, R_OUT + 0.18, 1, 0.1, pave)
    ring(R_IN - 0.15, R_IN + 0.05, 1, 0.1, pave)
    ring(0, R_IN - 0.15, 1, 0.1, lawn)

    # Five floors: glass wall set back between white slabs that cantilever out as canopies on both sides.
    for k in range(FLOORS):
        z = 1 + k * FLOOR
        ring(R_IN - 0.07, R_OUT + 0.07, z, 1.0, white)
        ring(R_IN + 0.03, R_OUT - 0.03, z + 1.0, FLOOR - 1.0, glass)
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
    for a0 in (0.25, 1.82, 3.39, 4.96):
        for i in range(6):
            a = a0 + i * 0.03
            p0 = (CU + (R_IN + 0.08) * math.cos(a), CV + (R_IN + 0.08) * math.sin(a), zp(top + 1.7))
            p1 = (CU + (R_OUT - 0.08) * math.cos(a), CV + (R_OUT - 0.08) * math.sin(a), zp(top + 1.7))
            rod(p0, p1, 0.02, sky, 4)
    # A thin team-colour line under the roof rim.
    ring(R_OUT + 0.11, R_OUT + 0.125, top - 0.4, 0.4, team)

    # Wooded courtyard: a pond and orchard trees inside the ring.
    lathe(CU, CV, 1, [(0, 0), (0.35, 0), (0.35, 0.15), (0, 0.15)], mat("#3d6a86", 0.05, grain=0, glass=True), 48)
    for _ in range(60):
        a, r = rng.uniform(0, 2 * math.pi), rng.uniform(0.45, R_IN - 0.25)
        tree(CU + r * math.cos(a), CV + r * math.sin(a), 1, rng.uniform(0.8, 1.2), leaf if rng.random() < 0.6 else leaf2, trunk)
    render("techcenter-usa-applepark", (5, 5), top + 12)


MODELS = {"techcenter-usa-applepark": apple_park}

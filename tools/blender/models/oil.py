"""Oil Derrick (4 x 4): one round welded fuel storage tank in a concrete bund, a team-colour band per owner."""
import math

from kit import box, cylinder, lathe, mat, render, rod, zp, TEAM

OIL_COLORS = dict(TEAM, neutral="#9aa3ab")


def oil_tank(key):
    team = OIL_COLORS[key]
    conc = mat("#9d998e", 0.95, grain=0.15, scale=8)
    box(0, 0, 4, 4, 0, 3, conc)
    box(0.25, 0.25, 3.5, 3.5, 3, 0.2, mat("#8a857a", 0.95, grain=0.2, scale=6))
    wall = mat("#bdb8ab", 0.9, grain=0.14, scale=14)
    for u, v, w, d in ((0.2, 0.2, 3.6, 0.12), (0.2, 0.32, 0.12, 3.36), (0.2, 3.68, 3.6, 0.12), (3.68, 0.32, 0.12, 3.36)):
        box(u, v, w, d, 3, 4, wall)
    R = 1.25
    shell = mat("#d6d3ca", 0.55, metal=0.25, grain=0.07, scale=10)
    cylinder(2, 2, R, 3, 20, shell, 64)
    cylinder(2, 2, R + 0.004, 23, 5, mat(team, 0.5, metal=0.2, grain=0.05), 64)
    cylinder(2, 2, R, 28, 14, shell, 64)
    # Weld seams (thin rings).
    seam = mat("#a9a69d", 0.6, metal=0.3, grain=0)
    for z in (9, 15, 21, 33, 38):
        cylinder(2, 2, R + 0.006, z, 0.35, seam, 64)
    # Roof rim, shallow cone, vent.
    cylinder(2, 2, R * 1.03, 42, 1.2, mat("#8e8b83", 0.6, metal=0.4, grain=0.03), 64)
    lathe(2, 2, 43.2, [(R * 1.02, 0), (0.15, 7.5), (0.0005, 8)], mat("#bab7ae", 0.6, metal=0.3, grain=0.05), 64, cap_bottom=True)
    cylinder(2, 2, 0.1, 50, 3, mat("#6f757c", 0.5, metal=0.6, grain=0))
    cylinder(2, 2, 0.15, 53, 0.6, mat("#55595e", 0.5, metal=0.6, grain=0))
    # Roof handrail.
    rail = mat("#e0b630", 0.5, metal=0.3, grain=0)
    n = 24
    for i in range(n):
        a = 2 * math.pi * i / n
        rod((2 + R * math.cos(a), 2 + R * math.sin(a), zp(43.2)), (2 + R * math.cos(a), 2 + R * math.sin(a), zp(47)), 0.008, rail, 4)
    lathe(2, 2, 46.6, [(R, 0), (R, 0.5)], rail, 64)
    render(f"oil-{key}", (4, 4), 58)


MODELS = {f"oil-{k}": (lambda k=k: oil_tank(k)) for k in OIL_COLORS}

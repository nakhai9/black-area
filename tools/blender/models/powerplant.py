"""Nuclear Power Plant (4 × 4), the same for every nation in its own concrete and chimney colour."""
import math

from kit import box, cylinder, lathe, mat, render, rod, zp, TEAM


POWER_MATERIALS = {
    "usa": ("#a9aaa6", "#c6c8c4"),
    "russia": ("#7e7a6c", "#b4b0a0"),
    "china": ("#8c8474", "#c2bcac"),
    "europe": ("#9a9ca4", "#cfd1d4"),
    "islamic": ("#a8987c", "#cec2a6"),
}
POWER_TOWERS = [(1.15, 1.0), (2.85, 1.2)]


def cooling_tower(cu, cv, z, base, h, concrete):
    """Hyperboloid shell (waist at 72 %) on a ring of slanted legs, open at the top."""
    legs = max(5.0, h * 0.07)
    prof = []
    for i in range(25):
        t = i / 24
        k = abs(t - 0.72) / 0.72
        r = base * (0.6 + 0.4 * (k**1.6) * (1 if t < 0.72 else 0.55))
        prof.append((r, legs + t * (h - legs)))
    lathe(cu, cv, z, prof, mat(concrete, 0.9, grain=0.1, scale=30), segs=64, thickness=0.035)
    # Darker throat inside, seen from above.
    lathe(cu, cv, z, [(prof[-1][0] * 0.97, h - 6), (prof[-1][0] * 0.97, h - 0.5)], mat("#3a3834", 0.95, grain=0), segs=64)
    lathe(cu, cv, z, [(0, h - 14), (prof[-1][0] * 0.97, h - 14)], mat("#2a2926", 0.95, grain=0), segs=64)
    leg = mat(concrete, 0.9, grain=0.08)
    n = 28 if base < 1 else 40
    for i in range(n):
        a = 2 * math.pi * i / n
        b = a + 0.18
        r = base
        rod((cu + r * math.cos(a), cv + r * math.sin(a), zp(z)), (cu + r * math.cos(b), cv + r * math.sin(b), zp(z + legs)), 0.018 * max(1, base / 0.85), leg)


SINGLE_TOWER = ("russia", "china", "islamic")
SINGLE_H = 130
LEGS = SINGLE_H * 0.07


def single_tower(faction):
    """Russia, China, Islamic world: one huge cooling tower filling the plot on a concrete apron, nothing else; a team-colour band near its lip."""
    pad, tower = POWER_MATERIALS[faction]
    base = 1.86
    # Concrete apron over the whole plot (sunk flush with the ground by kit.render), joint lines across it.
    box(0.02, 0.02, 3.96, 3.96, 0, 1.2, mat(pad, 0.95, grain=0.15, scale=8))
    joint = mat("#5f5c55", 0.95, grain=0)
    for k in (1, 2, 3):
        box(k - 0.008, 0.02, 0.016, 3.96, 1.2, 0.05, joint)
        box(0.02, k - 0.008, 3.96, 0.016, 1.2, 0.05, joint)
    cooling_tower(2, 2, 1.2, base, SINGLE_H, tower)
    # Painted band round the upper shell (radius follows the hyperboloid there).
    t0, t1 = 0.86, 0.9
    r = lambda t: base * (0.6 + 0.4 * ((abs(t - 0.72) / 0.72) ** 1.6) * 0.55) + 0.006
    lathe(2, 2, 1.2, [(r(t0), LEGS + t0 * (SINGLE_H - LEGS)), (r(t1), LEGS + t1 * (SINGLE_H - LEGS))], mat(TEAM[faction], 0.6, grain=0.05), segs=64)
    render(f"powerplant-{faction}", (4, 4), SINGLE_H + 8)


def power_plant(faction):
    if faction in SINGLE_TOWER:
        return single_tower(faction)
    pad, tower = POWER_MATERIALS[faction]
    team = TEAM[faction]
    box(0.04, 0.04, 3.92, 3.92, 0, 1.2, mat(pad, 0.95, grain=0.15, scale=8))
    for cu, cv in POWER_TOWERS:
        cooling_tower(cu, cv, 1.2, 0.85, 80, tower)
    # Chimney: white and team-colour bands, dark cap.
    bands = 7
    for i in range(bands):
        r = 0.17 * (1 - i * 0.03)
        cylinder(0.75, 2.95, r, 1.2 + i * 96 / bands, 96 / bands, mat("#f2f0ea" if i % 2 else team, 0.6, grain=0.05))
    cylinder(0.75, 2.95, 0.15, 97.2, 1.5, mat("#3a3834", 0.9, grain=0))
    # Pump house beside the chimney.
    box(1.2, 2.55, 1.0, 0.75, 1.2, 12, mat("#d4d2ca", 0.85), bevel=0.01)
    box(1.18, 2.53, 1.04, 0.79, 13.2, 1.2, mat("#6e706c", 0.7))
    for k in range(4):
        box(1.3 + k * 0.22, 3.29, 0.12, 0.02, 5, 4, mat("#2b3b48", 0.15, grain=0))
    # Pipes from the pump house to the towers.
    pipe = mat("#8a8d90", 0.4, metal=0.8, grain=0.03)
    rod((1.7, 2.55, zp(6)), (1.4, 1.6, zp(6)), 0.04, pipe)
    rod((2.2, 2.9, zp(6)), (2.8, 2.0, zp(6)), 0.04, pipe)
    # Wire fence round the pad.
    post = mat("#5c5f62", 0.6, metal=0.5, grain=0)
    rail = mat("#96999e", 0.5, metal=0.6, grain=0)
    e0, e1, fz, fh = 0.12, 3.88, zp(1.2), zp(7)
    for a, b in [((e0, e0), (e1, e0)), ((e0, e0), (e0, e1)), ((e0, e1), (e1, e1)), ((e1, e0), (e1, e1))]:
        n = round(math.dist(a, b) / 0.32)
        for i in range(n + 1):
            u = a[0] + (b[0] - a[0]) * i / n
            v = a[1] + (b[1] - a[1]) * i / n
            rod((u, v, fz), (u, v, fz + fh), 0.008, post, 4)
        for zz in (fz + fh * 0.45, fz + fh):
            rod((a[0], a[1], zz), (b[0], b[1], zz), 0.005, rail, 4)
    # Guard post with a team band and a barrier arm.
    box(3.15, 3.15, 0.55, 0.55, 1.2, 13, mat("#d9d6cc", 0.85), bevel=0.01)
    box(3.11, 3.11, 0.63, 0.63, 14.2, 1, mat("#6e706c", 0.7))
    box(3.15, 3.15, 0.55, 0.555, 12.3, 1.2, mat(team, 0.5, grain=0))
    box(3.2, 3.7, 0.45, 0.01, 6.5, 4.5, mat("#3d566a", 0.1, grain=0, glass=True))
    box(3.7, 3.2, 0.01, 0.45, 6.5, 4.5, mat("#3d566a", 0.1, grain=0, glass=True))
    box(2.6, 3.45, 0.5, 0.03, 5.2, 0.6, mat("#d8262b", 0.5, grain=0))
    render(f"powerplant-{faction}", (4, 4), 100)


MODELS = {f"powerplant-{f}": (lambda f=f: power_plant(f)) for f in TEAM}

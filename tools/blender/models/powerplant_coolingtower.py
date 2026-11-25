"""Power Plant, cooling-tower design (4 x 4): one huge hyperboloid cooling tower filling the plot on a concrete apron.

Design codes (BUILDING_DESIGNS.powerPlant): "coolingTower" (Nordursia, Longoria: ONE render, powerplant-russia, the
game recolours its team line for Longoria) and "coolingTowerSand" (Lunastron: its own render, warm sand concrete).
Architecture kept as before (same shell, base 1.86, height 130, lip where PowerPlant.ts puts the steam), with the
ART_GUIDE detail pass:
- shell: horizontal formwork rings and vertical precast seams, a thickened lip ring, a walkway railing round the lip,
  four aircraft warning lights, a maintenance ladder up the visible side, faint weathering streaks under the lip;
- base: the raker-column ring (diagonal legs) with the dark air inlet behind it, a water basin rim round the foot;
- apron: concrete slabs with joints both ways.
Team colour (TEAM[nation], exact): the band near the lip (as before) and a band on the basin rim.

Own geometry only (kit primitives and materials).
"""
import math

from kit import box, cylinder, lathe, mat, render, rod, zp, TEAM

MATERIALS = {"russia": ("#7e7a6c", "#b4b0a0"), "islamic": ("#a8987c", "#cec2a6")}
H = 130
BASE = 1.86
LEGS = H * 0.07
CU = CV = 2.0
Z0 = 1.2


def radius(t):
    """Shell radius at t (0 = top of the legs, 1 = lip); waist at 72 %."""
    k = abs(t - 0.72) / 0.72
    return BASE * (0.6 + 0.4 * (k**1.6) * (1 if t < 0.72 else 0.55))


def height(t):
    return Z0 + LEGS + t * (H - LEGS)


def tower(nation):
    pad, shell = MATERIALS[nation]
    concrete = mat(shell, 0.9, grain=0.1, scale=30)
    seam = mat("#a29e90" if nation == "russia" else "#bfb397", 0.9, grain=0)
    ring_m = mat("#a6a294" if nation == "russia" else "#c2b69b", 0.9, grain=0.05)
    dark = mat("#2a2926", 0.95, grain=0)
    team = mat(TEAM[nation], 0.55, grain=0)
    iron = mat("#3c3e40", 0.5, metal=0.6, grain=0)

    # Apron with joints both ways (sunk flush by kit.render).
    box(0.02, 0.02, 3.96, 3.96, 0, Z0, mat(pad, 0.95, grain=0.15, scale=8))
    joint = mat("#5f5c55", 0.95, grain=0)
    for k in range(1, 8):
        box(k * 0.5 - 0.006, 0.02, 0.012, 3.96, Z0, 0.05, joint)
        box(0.02, k * 0.5 - 0.006, 3.96, 0.012, Z0, 0.05, joint)

    # Water basin rim round the foot, team band on it.
    lathe(CU, CV, Z0, [(BASE + 0.1, 0), (BASE + 0.1, 2.2)], mat(pad, 0.9, grain=0.12), segs=96, cap_top=False)
    lathe(CU, CV, Z0 + 2.2, [(BASE + 0.13, 0), (BASE + 0.13, 0.9)], team, segs=96)
    # Dark air inlet behind the legs.
    lathe(CU, CV, Z0, [(BASE * 0.95, 0), (BASE * 0.95, LEGS + 0.5)], dark, segs=64)

    # Shell.
    prof = [(radius(i / 24), LEGS + i / 24 * (H - LEGS)) for i in range(25)]
    lathe(CU, CV, Z0, prof, concrete, segs=96, thickness=0.035)
    lathe(CU, CV, Z0, [(prof[-1][0] * 0.97, H - 6), (prof[-1][0] * 0.97, H - 0.5)], mat("#3a3834", 0.95, grain=0), segs=64)
    lathe(CU, CV, Z0, [(0, H - 14), (prof[-1][0] * 0.97, H - 14)], dark, segs=64)
    # Horizontal formwork rings (slightly proud, a shade darker).
    for i in range(1, 16):
        t = i / 16
        lathe(CU, CV, height(t) - 0.15, [(radius(t) + 0.004, 0), (radius(t + 0.003) + 0.004, 0.3)], ring_m, segs=96)
    # Vertical precast seams.
    for k in range(48):
        a = 2 * math.pi * k / 48
        prev = None
        for i in range(13):
            t = i / 12 * 0.985
            r = radius(t) + 0.003
            p = (CU + r * math.cos(a), CV + r * math.sin(a), zp(height(t)))
            if prev:
                rod(prev, p, 0.0035, seam, 4)
            prev = p
    # Faint weathering streaks under the lip.
    streak = mat("#8a8678" if nation == "russia" else "#b2a68c", 0.95, grain=0)
    for k in range(14):
        a = 2 * math.pi * (k + 0.3) / 14
        t0, t1 = 0.97, 0.8 - (k % 3) * 0.04
        r0, r1 = radius(t0) + 0.002, radius(t1) + 0.002
        rod((CU + r0 * math.cos(a), CV + r0 * math.sin(a), zp(height(t0))), (CU + r1 * math.cos(a), CV + r1 * math.sin(a), zp(height(t1))), 0.012, streak, 4)
    # Team band near the lip (as before).
    t0, t1 = 0.86, 0.9
    lathe(CU, CV, Z0, [(radius(t0) + 0.006, LEGS + t0 * (H - LEGS)), (radius(t1) + 0.006, LEGS + t1 * (H - LEGS))], team, segs=96)
    # Thickened lip ring, walkway railing, warning lights.
    rt = radius(1.0)
    lathe(CU, CV, Z0 + H - 1.6, [(rt + 0.025, 0), (rt + 0.025, 1.6)], ring_m, segs=96)
    for k in range(40):
        a = 2 * math.pi * k / 40
        rod((CU + (rt + 0.02) * math.cos(a), CV + (rt + 0.02) * math.sin(a), zp(Z0 + H)), (CU + (rt + 0.02) * math.cos(a), CV + (rt + 0.02) * math.sin(a), zp(Z0 + H + 2.2)), 0.004, iron, 4)
    lathe(CU, CV, Z0 + H + 2.0, [(rt + 0.024, 0), (rt + 0.024, 0.3)], iron, segs=96)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        cylinder(CU + (rt + 0.03) * math.cos(a), CV + (rt + 0.03) * math.sin(a), 0.03, Z0 + H + 0.2, 1.2, mat("#e02a1a", 0.3, grain=0, emit="#ff2a1a"), 10)
    # Maintenance ladder up the visible side (towards +u +v).
    a = math.pi / 4
    ca, sa = math.cos(a), math.sin(a)
    for off in (-0.03, 0.03):
        prev = None
        for i in range(25):
            t = i / 24
            r = radius(t) + 0.03
            p = (CU + r * ca - off * sa, CV + r * sa + off * ca, zp(height(t)))
            if prev:
                rod(prev, p, 0.004, iron, 4)
            prev = p
    for i in range(60):
        t = i / 59
        r = radius(t) + 0.03
        cx, cy = CU + r * ca, CV + r * sa
        rod((cx + 0.03 * sa, cy - 0.03 * ca, zp(height(t))), (cx - 0.03 * sa, cy + 0.03 * ca, zp(height(t))), 0.003, iron, 4)
    # Raker columns (diagonal legs) and the ring beam on top of them.
    leg = mat(shell, 0.9, grain=0.08)
    n = 40
    for i in range(n):
        a = 2 * math.pi * i / n
        b = a + 0.18
        rod((CU + BASE * math.cos(a), CV + BASE * math.sin(a), zp(Z0)), (CU + BASE * math.cos(b), CV + BASE * math.sin(b), zp(Z0 + LEGS)), 0.018 * BASE / 0.85, leg)
        rod((CU + BASE * math.cos(b), CV + BASE * math.sin(b), zp(Z0)), (CU + BASE * math.cos(a), CV + BASE * math.sin(a), zp(Z0 + LEGS)), 0.018 * BASE / 0.85, leg)
        cylinder(CU + BASE * math.cos(a), CV + BASE * math.sin(a), 0.05, Z0, 0.8, leg, 8)  # footing
    lathe(CU, CV, Z0 + LEGS - 0.6, [(radius(0) + 0.02, 0), (radius(0) + 0.02, 1.2)], ring_m, segs=96)
    render(f"powerplant-{nation}", (4, 4), H + 8)


MODELS = {f"powerplant-{n}": (lambda n=n: tower(n)) for n in MATERIALS}

from models._utilwreck import variant  # noqa: E402

for _k in MATERIALS:
    for _d in (1, 2, 3):
        MODELS[f"powerplant-{_k}-d{_d}"] = (lambda k=_k, d=_d: variant(globals(), lambda: tower(k), d, side=(1.0, 0.5), stub=8, frag=30, rock=1.6))

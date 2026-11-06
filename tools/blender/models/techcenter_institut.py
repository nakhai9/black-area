"""Europe High-Tech Center (4 × 5): the Institut de France (Académie des sciences) on the Seine — a long, symmetric
cream-limestone palace running the 5-cell length (v): a central domed chapel (columned drum, ribbed lead dome, lantern
and gilded finial) behind a pedimented Corinthian portico, two curved two-storey wings with balustrades sweeping forward
from it, and square end pavilions under steep slate mansard roofs with dormers and chimneys; quay railings and lamps on
the front (+u) side."""
import math

from kit import box, cylinder, dome, lathe, mat, render, roof, windows, TEAM

STONE = "#ddcfb2"
STONE_D = "#c6b796"
SLATE = "#4b5059"
GLASS = "#2f3a45"


def institut():
    stone = mat(STONE, 0.8, grain=0.12, scale=22)
    stone_d = mat(STONE_D, 0.85, grain=0.14, scale=22)
    slate = mat(SLATE, 0.55, metal=0.2, grain=0.1, scale=60)
    lead = mat("#6f7680", 0.4, metal=0.5, grain=0.06)
    glass = mat(GLASS, 0.15, grain=0, glass=True)
    frame = mat("#e9e1cc", 0.6, grain=0)
    gold = mat("#e2b64a", 0.3, metal=0.85, grain=0)
    iron = mat("#22262b", 0.5, metal=0.6, grain=0)
    pave = mat("#9a948a", 0.9, grain=0.15, scale=40)
    team = mat(TEAM["europe"], 0.5, grain=0.05)

    # Quay paving over the whole plot (sunk flush by kit.render).
    box(0.02, 0.02, 3.96, 4.96, 0, 1, pave)

    # Curved wings: a concave crescent of short straight segments, each stepping forward towards the ends.
    cv = 2.5
    for side in (-1, 1):
        for k in range(5):
            v = cv + side * (0.55 + k * 0.3) - (0.3 if side < 0 else 0)
            u0 = 0.55 + k * 0.12  # sweeps forward (+u) away from the centre
            box(u0, v, 1.3, 0.3, 1, 18, stone)
            windows("right", u0, v, 1.3, 0.3, 1, 18, 1, 2, glass, frame, margin=0.15, fill=0.55)
            box(u0 + 1.28, v, 0.03, 0.3, 18, 2.2, stone_d)  # balustrade
            roof(u0 + 0.05, v, 0.9, 0.3, 18, 4, slate, kind="gable", ridge="v", overhang=0.02)

    # End pavilions with steep mansard roofs, dormers and chimneys.
    for v in (0.1, 4.0):
        u0, w, d = 1.15, 1.6, 0.9
        box(u0, v, w, d, 1, 22, stone)
        windows("right", u0, v, w, d, 1, 22, 3, 2, glass, frame, margin=0.12, fill=0.55)
        windows("left", u0, v, w, d, 1, 22, 4, 2, glass, frame, margin=0.1, fill=0.5)
        box(u0 - 0.03, v - 0.03, w + 0.06, d + 0.06, 22, 1.4, stone_d)
        box(u0 + 0.05, v + 0.05, w - 0.1, d - 0.1, 23.4, 7, slate)
        roof(u0 + 0.05, v + 0.05, w - 0.1, d - 0.1, 30.4, 6, slate, kind="hip", ridge="u", overhang=0.02)
        for k in range(3):
            box(u0 + w - 0.07, v + 0.18 + k * 0.25, 0.08, 0.12, 24.5, 4, stone)
            box(u0 + w - 0.06, v + 0.2 + k * 0.25, 0.03, 0.08, 25, 2.6, glass)
        for cu in (u0 + 0.3, u0 + w - 0.4):
            box(cu, v + 0.35, 0.12, 0.18, 30, 9, stone_d)

    # Central chapel: square base, pedimented Corinthian portico on the front, drum, dome, lantern.
    base_u, base_v, bw = 0.6, 1.85, 1.3
    box(base_u, base_v, 1.8, bw, 1, 24, stone)
    windows("left", base_u, base_v, 1.8, bw, 1, 24, 3, 2, glass, frame, margin=0.12, fill=0.45)
    box(base_u - 0.03, base_v - 0.03, 1.86, bw + 0.06, 24, 1.5, stone_d)
    pu = base_u + 1.8
    box(pu, base_v + 0.05, 0.45, bw - 0.1, 1, 1.5, stone_d)  # steps
    for k in range(6):
        cylinder(pu + 0.32, base_v + 0.15 + k * (bw - 0.3) / 5, 0.045, 2.5, 19, stone, 12)
    box(pu + 0.02, base_v + 0.05, 0.4, bw - 0.1, 21.5, 2.5, stone_d)  # entablature
    roof(pu + 0.02, base_v + 0.05, 0.4, bw - 0.1, 24, 6, stone, kind="gable", ridge="u", overhang=0.03)
    box(pu - 0.02, base_v + 0.45, 0.03, 0.4, 3, 11, mat("#3a2e24", 0.7, grain=0.05))  # doors
    cu, cvv = base_u + 0.9, base_v + bw / 2
    cylinder(cu, cvv, 0.62, 25.5, 4, stone_d, 48)
    lathe(cu, cvv, 29.5, [(0.56, 0), (0.56, 13)], stone, segs=48, cap_top=True)
    for k in range(16):
        a = 2 * math.pi * k / 16
        cylinder(cu + 0.57 * math.cos(a), cvv + 0.57 * math.sin(a), 0.035, 29.5, 13, stone_d, 8)
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        box(cu + 0.56 * math.cos(a) - 0.04, cvv + 0.56 * math.sin(a) - 0.04, 0.08, 0.08, 33, 6, glass)
    cylinder(cu, cvv, 0.6, 42.5, 1.5, stone_d, 48)
    dome(cu, cvv, 0.56, 44, 20, lead, segs=48, rings=14)
    cylinder(cu, cvv, 0.16, 63, 7, stone, 16)
    dome(cu, cvv, 0.17, 70, 4, lead, segs=16, rings=6)
    cylinder(cu, cvv, 0.015, 74, 10, gold, 6)
    box(cu - 0.01, cvv, 0.02, 0.18, 81, 4, team)  # EU flag on the finial

    # Quay: iron railings and lamp posts along the front.
    box(3.85, 0.1, 0.02, 4.8, 1, 3, iron)
    for v in (0.4, 1.6, 3.4, 4.6):
        cylinder(3.75, v, 0.025, 1, 12, iron, 8)
        box(3.71, v - 0.04, 0.08, 0.08, 13, 2.5, mat("#f2dc9a", 0.3, grain=0, emit="#f2dc9a"))
    render("techcenter-europe-institut", (4, 5), 85)


MODELS = {"techcenter-europe-institut": institut}

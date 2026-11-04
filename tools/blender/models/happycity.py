"""Happy City (8 x 8), one per nation in its own architecture; same layout as ui/src/render/sprites/HappyCity.ts."""
import math
import random

from kit import box, cylinder, dome, lathe, mat, render, rod, roof, windows, zp, TEAM

N = 8
G = 2
ASPHALT = "#4a4c50"


def glass():
    return mat("#33475c", 0.12, grain=0, glass=True)


def floor(u0, v0, u1, v1, color, z=0.0, rough=0.9, grain=0.1):
    box(u0, v0, u1 - u0, v1 - v0, G + z, 0.15, mat(color, rough, grain=grain, scale=12))


def base():
    box(0, 0, N, N, 0, G, mat(ASPHALT, 0.92, grain=0.12, scale=40))


def tree(u, v, r=0.18, color="#4f7a36"):
    cylinder(u, v, r * 0.14, G, 6, mat("#5b4330", 0.9, grain=0.1), segs=6)
    leaf = mat(color, 0.85, grain=0.3, scale=25)
    dome(u, v, r, G + 5, r * 34, leaf, segs=10, rings=5)
    lathe(u, v, G + 4, [(0.001, 0), (r * 0.9, 0.5), (r, 1.01)], leaf, segs=10)


def bldg(u, v, w, d, z, h, color, floors, rough=0.85, grain=0.1, cols=None, frame=None, plinth=True):
    """Box with storey window grids on both visible faces and a darker street-level band."""
    box(u, v, w, d, z, h, mat(color, rough, grain=grain, scale=14))
    g = glass()
    fr = mat(frame, 0.7, grain=0) if frame else None
    windows("left", u, v, w, d, z, h, cols or max(2, round(w * 5)), floors, g, fr, margin=0.06, fill=0.5)
    windows("right", u, v, w, d, z, h, cols or max(2, round(d * 5)), floors, g, fr, margin=0.06, fill=0.5)
    if plinth and z <= G:
        box(u - 0.005, v - 0.005, w + 0.01, d + 0.01, z, min(3, h * 0.1), mat(color, 0.9, grain=0.15))


def flat_roof(u, v, w, d, top, color, seed=0):
    box(u + 0.03, v + 0.03, w - 0.06, d - 0.06, top, 0.4, mat("#3e3e3c", 0.95, grain=0.15))
    pm = mat(color, 0.85, grain=0.1)
    box(u, v, w, 0.04, top, 2, pm)
    box(u, v + d - 0.04, w, 0.04, top, 2, pm)
    box(u, v, 0.04, d, top, 2, pm)
    box(u + w - 0.04, v, 0.04, d, top, 2, pm)
    rnd = random.Random(seed)
    for _ in range(2):
        bw = min(0.3, w * 0.3)
        box(u + 0.1 + rnd.random() * (w - bw - 0.2), v + 0.1 + rnd.random() * max(0.01, d - bw - 0.2), bw, bw * 0.7, top, 3, mat("#9a9a96", 0.6, metal=0.3))


def star(cu, cv, z, r, material):
    """Five-pointed star standing in the screen plane (u - v across, z up)."""
    for k in range(5):
        a = -math.pi / 2 + k * 2 * math.pi / 5
        x, y = math.cos(a) * r * 0.7, -math.sin(a) * r
        rod((cu, cv, zp(z)), (cu + x, cv - x, zp(z) + y), 0.035, material, 4)


# ---------------------------------------------------------------- USA


def usa(team):
    rnd = random.Random(7)
    base()
    LOT, ST = 2, 0.16

    def inner(i):
        return i * LOT + ST, (i + 1) * LOT - ST

    def down(i, j):
        return 1 <= i <= 2 and 1 <= j <= 2

    GL = ["#4e6a86", "#5d7a8f", "#3f5670", "#6c7f8e", "#7a8794"]
    HOUSES = ["#e6dccb", "#c9d6dc", "#e8d3b0", "#d8c2c2", "#cfd9c4"]
    ROOFS = ["#6a4a3a", "#4f5864", "#7a3f32", "#5a5048"]
    for i in range(4):
        for j in range(4):
            u0, u1 = inner(i)
            v0, v1 = inner(j)
            floor(u0 - 0.06, v0 - 0.06, u1 + 0.06, v1 + 0.06, "#a8a59c", 0)
            floor(u0, v0, u1, v1, "#8f8c84" if down(i, j) else "#5f8a42", 0.15, grain=0.25)
            if i == 1 and j == 1:
                c = "#cbc3aa"
                bldg(u0 + 0.1, v0 + 0.1, 1.5, 1.5, G, 84, c, 15, frame="#e8e2cc")
                box(u0 + 0.1, v0 + 1.6, 1.5, 0.015, G + 80, 4, mat(team, 0.5, grain=0))
                bldg(u0 + 0.3, v0 + 0.3, 1.1, 1.1, G + 84, 56, "#d3cbb2", 10, plinth=False)
                bldg(u0 + 0.5, v0 + 0.5, 0.7, 0.7, G + 140, 34, "#dad3bc", 6, plinth=False)
                box(u0 + 0.6, v0 + 0.6, 0.5, 0.5, G + 174, 8, mat("#e0dac6", 0.6))
                roof(u0 + 0.65, v0 + 0.65, 0.4, 0.4, G + 182, 10, mat("#d9d4c4", 0.4, metal=0.5), "pyramid", overhang=0)
                continue
            if down(i, j):
                for half in (0, 1):
                    u, v = u0 + 0.05, v0 + 0.05 + half * 0.88
                    w, d = u1 - u0 - 0.1, 0.78
                    h = 44 + rnd.random() * 40
                    col = GL[rnd.randrange(len(GL))]
                    box(u, v, w, d, G, h, mat(col, 0.2, metal=0.4, grain=0.05))
                    fl = round(h / 6)
                    for k in range(1, fl):
                        box(u - 0.004, v - 0.004, w + 0.008, d + 0.008, G + k * h / fl, 0.7, mat("#c8ccd0", 0.5, metal=0.6, grain=0))
                    box(u - 0.005, v + d - 0.01, w + 0.01, 0.02, G + h - 2, 2, mat(team, 0.5, grain=0))
                    flat_roof(u, v, w, d, G + h, "#9aa0a6", int(u * 13 + v * 7))
                continue
            for du, dv in ((0, 0), (1, 0), (0, 1), (1, 1)):
                u, v = u0 + du * 0.88 + 0.12, v0 + dv * 0.88 + 0.14
                col = HOUSES[rnd.randrange(len(HOUSES))]
                rf = ROOFS[rnd.randrange(len(ROOFS))]
                box(u, v, 0.55, 0.5, G, 8, mat(col, 0.85, grain=0.1))
                trim = mat("#f2f0ea", 0.7, grain=0)
                windows("left", u, v, 0.55, 0.5, G, 8, 2, 1, glass(), trim)
                windows("right", u, v, 0.55, 0.5, G, 8, 2, 1, glass(), trim)
                roof(u, v, 0.55, 0.5, G + 8, 6, mat(rf, 0.85, grain=0.15), "gable", "v", 0.04)
                box(u + 0.2, v + 0.5, 0.2, 0.1, G, 0.3, mat("#9a978e", 0.9))
                tree(u + 0.66, v + 0.6, 0.13)
    lane = mat("#d8cf8a", 0.7, grain=0)
    for k in range(1, 4):
        for s in range(16):
            box(k * LOT - 0.012, s * 0.5 + 0.1, 0.024, 0.3, G, 0.2, lane)
            box(s * 0.5 + 0.1, k * LOT - 0.012, 0.3, 0.024, G, 0.2, lane)
    render("happycity-usa", (N, N), 210)


# ---------------------------------------------------------------- Russia


def slab_block(u, v, w, d, color):
    h = 26
    bldg(u, v, w, d, G, h, color, 5, grain=0.08)
    joint = mat("#6f6c66", 0.9, grain=0)
    for k in range(1, 4):
        box(u + w * k / 4 - 0.006, v + d, 0.012, 0.012, G, h, joint)
        box(u + w, v + d * k / 4 - 0.006, 0.012, 0.012, G, h, joint)
    flat_roof(u, v, w, d, G + h, color, int(u * 11 + v * 5))


def russia(team):
    base()
    floor(0, 4.1, N, 4.9, "#55585e", 0)
    dash = mat("#e2e2da", 0.7, grain=0)
    for k in range(8):
        box(k + 0.2, 4.48, 0.5, 0.04, G + 0.15, 0.15, dash)
    floor(0, 0, N, 4.05, "#9c998f", 0)
    floor(0, 4.95, N, N, "#9c998f", 0)
    floor(2.4, 4.95, 5.6, 7.95, "#b8a68c", 0.1, grain=0.2)
    floor(3.9, 4.95, 4.1, 7.95, "#c8b89c", 0.15)
    for u, v, w, d, c in [(0.15, 0.2, 2.1, 1.5, "#b9b4a6"), (0.15, 2.0, 2.1, 1.6, "#c8b9a0"), (5.75, 0.2, 2.1, 1.5, "#a9aeb2"), (5.75, 2.0, 2.1, 1.6, "#bdb39b"), (5.9, 5.0, 1.95, 1.3, "#b4b8b0"), (5.9, 6.55, 1.95, 1.3, "#c2b29a")]:
        slab_block(u, v, w, d, c)
    # Seven Sisters: wings, stepped tower, golden spire and red star.
    S = "#e6dac0"
    bldg(2.55, 0.9, 2.9, 2.4, G, 34, S, 6, frame="#f4ecd8")
    flat_roof(2.55, 0.9, 2.9, 2.4, G + 34, S, 3)
    bldg(3.15, 1.2, 1.7, 1.6, G + 34, 46, "#ece1c9", 8, plinth=False)
    bldg(3.5, 1.5, 1.0, 1.0, G + 80, 30, "#f1e7d0", 5, plinth=False)
    box(3.45, 1.45, 1.1, 1.1, G + 110, 3, mat("#f6efdc", 0.7))
    roof(3.6, 1.6, 0.8, 0.8, G + 113, 30, mat("#d9b45a", 0.3, metal=0.9, grain=0.03), "pyramid", overhang=0)
    gold = mat("#e8c45a", 0.25, metal=1.0, grain=0)
    rod((4.0, 2.0, zp(G + 140)), (4.0, 2.0, zp(G + 156)), 0.025, gold)
    star(4.0, 2.0, G + 160, 0.18, mat("#d42a1e", 0.4, grain=0, emit="#701010"))
    # Orthodox church: white walls, green roof, onion domes.
    u, v, w, d = 0.3, 5.0, 1.8, 1.5
    bldg(u, v, w, d, G, 16, "#f3eee2", 1, cols=4)
    box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, G + 16, 2, mat("#4f7a5a", 0.6, metal=0.3))
    cu, cv = u + w / 2, v + d / 2
    for du, dv, bulb in ((-0.5, -0.45, "#3f6fb0"), (0.5, -0.45, "#2f7a4f"), (-0.5, 0.45, "#d23b2b"), (0.5, 0.45, "#3f6fb0")):
        a, b = cu + du * w * 0.5, cv + dv * d * 0.55
        cylinder(a, b, 0.13, G + 18, 8, mat("#f1ead8", 0.8), 16)
        dome(a, b, 0.14, G + 26, 16, mat(bulb, 0.35, metal=0.3, grain=0.05), onion=True)
        rod((a, b, zp(G + 41)), (a, b, zp(G + 47)), 0.012, gold)
    cylinder(cu, cv, 0.22, G + 18, 16, mat("#f1ead8", 0.8), 20)
    dome(cu, cv, 0.24, G + 34, 26, mat("#e2b23a", 0.25, metal=1.0, grain=0.02), onion=True)
    rod((cu, cv, zp(G + 59)), (cu, cv, zp(G + 67)), 0.015, gold)
    bldg(0.3, 6.8, 1.8, 1.05, G, 20, "#c9a99a", 4)
    box(0.27, 6.77, 1.86, 1.11, G + 20, 1.5, mat("#f6f1e4", 0.8))
    roof(0.3, 6.8, 1.8, 1.05, G + 21.5, 6, mat("#4f7a5a", 0.6, metal=0.3), "hip", "u", 0.04)
    # Metro pavilion with the red "M" sign.
    box(3.6, 6.3, 0.8, 0.5, G, 7, mat("#e8e2d2", 0.8))
    box(3.75, 6.8, 0.5, 0.01, G, 5, mat("#2a2a30", 0.6, grain=0))
    box(3.55, 6.25, 0.9, 0.6, G + 7, 1.5, mat("#d8d0bc", 0.8))
    box(3.9, 6.5, 0.2, 0.04, G + 8.5, 5, mat("#d42a1e", 0.5, grain=0, emit="#601010"))
    for uu in (2.6, 5.4):
        for vv in (5.2, 6.4, 7.6):
            tree(uu, vv, 0.16, "#4b7d3a")
    render("happycity-russia", (N, N), 175)


# ---------------------------------------------------------------- China


def curved_roof(u, v, w, d, z, h, color):
    m = mat(color, 0.7, grain=0.15, scale=40)
    ridge = "u" if w >= d else "v"
    roof(u, v, w, d, z, h * 0.5, m, "hip", ridge, 0.1)
    roof(u + 0.05, v + 0.05, w - 0.1, d - 0.1, z + h * 0.3, h * 0.7, m, "hip", ridge, 0.0)


def china(team):
    base()
    GREY, TILE, RED = "#8d9096", "#4f5964", "#a8322a"
    floor(0, 0, N, N, "#9e9a90", 0)
    floor(3.3, 0, 4.7, N, "#cfc4ad", 0.1)
    floor(3.9, 0, 4.1, N, "#b8463a", 0.15)
    floor(0, 3.2, N, 3.45, "#55585e", 0.1)
    red = mat(RED, 0.6, grain=0.05)

    def wing(u, v, w, d):
        box(u, v, w, d, G, 10, mat(GREY, 0.9, grain=0.12))
        box(u + w * 0.42, v + d, w * 0.16, 0.01, G, 7, red)
        box(u + w, v + d * 0.42, 0.01, d * 0.16, G, 7, red)
        box(u - 0.005, v - 0.005, w + 0.01, d + 0.01, G + 8, 1.5, red)
        curved_roof(u, v, w, d, G + 10, 8, TILE)

    for v in (3.6, 5.8):
        for u in (0.4, 4.7):
            w, d, t = 2.9, 2.0, 0.34
            floor(u + t, v + t, u + w - t, v + d - t, "#c9bfa8", 0.15)
            tree(u + w / 2, v + d / 2, 0.18, "#5a8a3c")
            wing(u, v, w, t)
            wing(u, v + t, t, d - 2 * t)
            wing(u + w - t, v + t, t, d - 2 * t)
            wing(u, v + d - t, w, t)
    # Oriental Pearl tower.
    box(0.4, 0.4, 2.7, 2.7, G, 6, mat("#d9d2c4", 0.8))
    for du, dv in ((0.5, 2.2), (2.2, 0.5), (2.2, 2.2), (0.5, 0.5)):
        rod((0.4 + du, 0.4 + dv, zp(G + 6)), (1.75 + (0.4 + du - 1.75) * 0.25, 1.75 + (0.4 + dv - 1.75) * 0.25, zp(G + 50)), 0.09, mat("#d8d8d8", 0.5), 12)
    cylinder(1.75, 1.75, 0.13, G + 6, 150, mat("#e1e1e1", 0.5), 16)
    pink = mat(team, 0.15, metal=0.6, grain=0)
    lathe(1.75, 1.75, G + 44, [(0.001, 0), (0.45, 4), (0.62, 13), (0.45, 22), (0.001, 26)], pink, 32)
    lathe(1.75, 1.75, G + 112, [(0.001, 0), (0.3, 3), (0.4, 9), (0.3, 15), (0.001, 18)], pink, 32)
    lathe(1.75, 1.75, G + 150, [(0.001, 0), (0.18, 4.5), (0.001, 9)], pink, 24)
    rod((1.75, 1.75, zp(G + 158)), (1.75, 1.75, zp(G + 182)), 0.02, mat("#e8e8e8", 0.3, metal=0.8))
    # Shanghai Tower: a glass tower narrowing upward.
    box(4.9, 0.5, 2.6, 2.6, G, 6, mat("#cfd6dc", 0.7))
    prof = [(0.95 - k * 0.07, k * 21) for k in range(10)]
    lathe(6.2, 1.8, G + 6, prof + [(0.3, 192), (0.001, 192)], mat("#6f8ea8", 0.12, metal=0.5, grain=0.03), 14)
    ring = mat("#e6edf2", 0.4, metal=0.5)
    for k in range(1, 10):
        cylinder(6.2, 1.8, 0.95 - k * 0.07 + 0.015, G + 6 + k * 21 - 1, 1.2, ring, 14)
    cylinder(6.2, 1.8, 0.28, G + 6 + 189, 8, ring, 12)
    v = 3.7
    while v < 7.4:
        for u in (3.55, 4.45):
            tree(u, v, 0.15)
        v += 0.9
    # Paifang gate.
    for u in (3.35, 3.85, 4.4):
        box(u, 7.45, 0.12, 0.12, G, 18, red)
    box(3.3, 7.42, 1.4, 0.18, G + 18, 3, mat("#d4a23a", 0.5, grain=0.05))
    curved_roof(3.25, 7.38, 1.5, 0.26, G + 21, 6, "#2f6b5a")
    render("happycity-china", (N, N), 205)


# ---------------------------------------------------------------- Europe


def europe(team):
    rnd = random.Random(11)
    base()
    STONE = ["#d8cdb3", "#cfc3a6", "#e0d6bf", "#c9bc9c"]
    SLATE = mat("#4e5864", 0.55, metal=0.2, grain=0.08)
    floor(0, 0, N, N, "#aaa498", 0)
    floor(3.45, 0, 4.55, N, "#5e6166", 0.1)
    floor(0, 3.45, N, 4.55, "#5e6166", 0.1)
    floor(2.8, 2.8, 5.2, 5.2, "#b3a58f", 0.2, grain=0.3)
    iron = mat("#2e2e2e", 0.6, metal=0.5, grain=0)

    def hm(u, v, w, d):
        c = STONE[rnd.randrange(len(STONE))]
        h = 28
        bldg(u, v, w, d, G, h, c, 6, frame="#efe8d6", grain=0.12)
        box(u, v + d, w, 0.04, G + h * 0.62, 0.7, iron)
        box(u + w, v, 0.04, d, G + h * 0.62, 0.7, iron)
        box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, G + h, 1.5, mat(c, 0.8))
        roof(u + 0.04, v + 0.04, w - 0.08, d - 0.08, G + h + 1.5, 9, SLATE, "hip", "u" if w >= d else "v", 0)
        n = max(2, round(w / 0.4))
        for k in range(n):
            du = u + 0.12 + k * (w - 0.34) / max(1, n - 1)
            box(du, v + d - 0.22, 0.1, 0.12, G + h + 2, 4, mat("#e4dccb", 0.8))
            roof(du, v + d - 0.22, 0.1, 0.12, G + h + 6, 2, SLATE, "gable", "v", 0.01)

    for u0, u1 in ((0.15, 3.4), (4.6, 7.85)):
        for v0, v1 in ((0.15, 3.4), (4.6, 7.85)):
            if v0 < 1 and u0 > 4:
                continue
            mu, mv = (u0 + u1) / 2, (v0 + v1) / 2
            hm(u0, v0, mu - u0 - 0.06, mv - v0 - 0.06)
            hm(mu + 0.06, v0, u1 - mu - 0.06, mv - v0 - 0.06)
            hm(u0, mv + 0.06, mu - u0 - 0.06, v1 - mv - 0.06)
            hm(mu + 0.06, mv + 0.06, u1 - mu - 0.06, v1 - mv - 0.06)
    hm(6.75, 0.2, 1.1, 3.15)
    # Gothic cathedral: nave, buttresses, twin west towers with spires, rose window.
    c = mat("#d4c8a8", 0.9, grain=0.18, scale=30)
    box(4.9, 0.3, 1.5, 2.4, G, 34, c)
    windows("right", 4.9, 0.3, 1.5, 2.4, G, 34, 5, 1, mat("#4a3f6a", 0.15, grain=0, glass=True), margin=0.08, fill=0.4)
    roof(4.9, 0.3, 1.5, 2.4, G + 34, 18, SLATE, "gable", "v", 0.03)
    for k in range(5):
        box(6.42, 0.45 + k * 0.48, 0.12, 0.12, G, 26, c)
    for u in (4.85, 5.85):
        box(u, 2.6, 0.6, 0.6, G, 62, c)
        windows("left", u, 2.6, 0.6, 0.6, G, 62, 1, 4, mat("#2f3440", 0.3, grain=0))
        windows("right", u, 2.6, 0.6, 0.6, G, 62, 1, 4, mat("#2f3440", 0.3, grain=0))
        roof(u + 0.05, 2.65, 0.5, 0.5, G + 62, 34, SLATE, "pyramid", overhang=0)
    box(5.45, 2.6, 0.4, 0.6, G, 40, c)
    box(5.5, 3.2, 0.3, 0.012, G + 26, 10, mat("#7a4a8c", 0.2, grain=0, glass=True))
    box(5.55, 3.2, 0.2, 0.012, G, 14, mat("#3a2a20", 0.7, grain=0))
    # Fountain and café umbrellas on the square.
    stone = mat("#cfc6b0", 0.8)
    cylinder(4, 4, 0.42, G, 2.5, stone, 32)
    cylinder(4, 4, 0.37, G + 2.5, 0.3, mat("#5f93b8", 0.05, grain=0, glass=True), 32)
    cylinder(4, 4, 0.08, G + 2.5, 8, stone, 12)
    dome(4, 4, 0.14, G + 10, 3, stone)
    for u, v, col in ((3.0, 4.7, "#c8302a"), (4.8, 3.0, team), (4.95, 4.8, "#2f6fae"), (3.1, 3.15, "#e8b13c")):
        rod((u, v, zp(G)), (u, v, zp(G + 6)), 0.01, mat("#dddddd", 0.5))
        roof(u - 0.2, v - 0.2, 0.4, 0.4, G + 5, 3, mat(col, 0.7, grain=0), "pyramid", overhang=0)
        cylinder(u + 0.15, v + 0.1, 0.08, G, 2.5, mat("#6a5a48", 0.8), 10)
    render("happycity-europe", (N, N), 105)


# ---------------------------------------------------------------- Islamic world


def islamic(team):
    rnd = random.Random(5)
    base()
    floor(0, 0, N, N, "#a99474", 0, grain=0.2)
    SAND = ["#cdb894", "#c2a77c", "#d6c3a0", "#b89c72"]
    wood = mat("#6a4a2e", 0.8, grain=0.1)
    lots = [(0.1, 3.7, 1.9, 1.9), (2.1, 3.7, 1.8, 1.9), (4.1, 3.7, 1.8, 1.9), (6.0, 3.7, 1.9, 1.9), (0.1, 5.75, 1.9, 2.1), (2.1, 5.75, 1.8, 2.1), (4.1, 5.75, 1.8, 2.1), (6.0, 5.75, 1.9, 2.1), (6.0, 0.15, 1.9, 1.7), (6.0, 1.95, 1.9, 1.6)]
    for u, v, w, d in lots:
        col = SAND[rnd.randrange(4)]
        h = 12 + rnd.randrange(3) * 4
        t = min(w, d) * 0.3
        m = mat(col, 0.95, grain=0.2, scale=20)
        for bu, bv, bw, bd in ((u, v, w, t), (u, v + t, t, d - 2 * t), (u + w - t, v + t, t, d - 2 * t), (u, v + d - t, w, t)):
            box(bu, bv, bw, bd, G, h, m)
            box(bu, bv, bw, bd, G + h, 1.5, mat(col, 0.95, grain=0.1))
            box(bu + 0.03, bv + 0.03, bw - 0.06, bd - 0.06, G + h + 0.3, 1.3, mat("#9c8466", 0.95, grain=0.1))
        floor(u + t, v + t, u + w - t, v + d - t, "#5f8f46", 0.1, grain=0.3)
        cylinder(u + w / 2, v + d / 2, 0.1, G, 2, mat("#3f8fb0", 0.1, grain=0, glass=True), 12)
        tree(u + w / 2 + 0.2, v + d / 2 - 0.15, 0.13, "#4f7a36")
        box(u + w * 0.35, v + d, w * 0.2, 0.025, G + h * 0.45, h * 0.35, wood)  # mashrabiya
        box(u + w, v + d * 0.4, 0.025, d * 0.2, G + h * 0.45, h * 0.35, wood)
        box(u + w * 0.7, v + d, w * 0.1, 0.012, G, h * 0.4, mat("#3a2a1c", 0.8, grain=0))  # door
    # The mosque: prayer hall, green main dome and corner domes, iwan portal, two minarets.
    W = mat("#ece3d0", 0.85, grain=0.1)
    box(2.1, 0.4, 3.6, 2.9, G, 20, W)
    windows("left", 2.1, 0.4, 3.6, 2.9, G, 20, 6, 1, mat("#2c4a5a", 0.2, grain=0), margin=0.08, fill=0.4)
    windows("right", 2.1, 0.4, 3.6, 2.9, G, 20, 5, 1, mat("#2c4a5a", 0.2, grain=0), margin=0.08, fill=0.4)
    box(2.08, 0.38, 3.64, 2.94, G + 20, 2, mat("#d8ccb2", 0.85))
    green = mat("#2f8a5a", 0.3, metal=0.4, grain=0.03)
    cylinder(3.9, 1.85, 0.8, G + 22, 10, W, 40)
    dome(3.9, 1.85, 0.82, G + 32, 34, green, 48, 16)
    rod((3.9, 1.85, zp(G + 66)), (3.9, 1.85, zp(G + 74)), 0.015, mat("#e8c45a", 0.25, metal=1))
    for cu, cv in ((2.6, 0.9), (5.2, 0.9), (2.6, 2.8), (5.2, 2.8)):
        cylinder(cu, cv, 0.22, G + 22, 4, W, 20)
        dome(cu, cv, 0.24, G + 26, 10, green, 24, 8)
    box(3.5, 3.25, 0.8, 0.12, G, 32, W)
    box(3.65, 3.37, 0.5, 0.012, G, 22, mat("#2f6f8a", 0.4, grain=0.05))
    for cu, cv in ((2.25, 3.15), (5.55, 3.15)):
        cylinder(cu, cv, 0.13, G, 70, W, 16)
        cylinder(cu, cv, 0.17, G + 52, 2.5, mat("#d8ccb2", 0.8), 16)
        cylinder(cu, cv, 0.09, G + 70, 12, W, 16)
        lathe(cu, cv, G + 82, [(0.11, 0), (0.001, 12)], green, 16, cap_bottom=True)
    # Gulf super-tower: a stepped silver needle.
    box(0.2, 0.3, 1.6, 3.0, G, 6, mat("#d9d4c8", 0.8))
    for r, z, h in ((0.62, 0, 60), (0.5, 60, 46), (0.38, 106, 34), (0.26, 140, 22), (0.14, 162, 14)):
        cylinder(1.0, 1.8, r, G + 6 + z, h, mat("#9fb0bc", 0.12, metal=0.6, grain=0.02), 10)
        cylinder(1.0, 1.8, r + 0.02, G + 6 + z + h - 1.2, 1.2, mat("#e8eef2", 0.4, metal=0.5), 10)
        for k in range(1, int(h // 6)):
            cylinder(1.0, 1.8, r + 0.006, G + 6 + z + k * 6, 0.5, mat("#c8d2da", 0.4, metal=0.6, grain=0), 10)
    rod((1.0, 1.8, zp(G + 182)), (1.0, 1.8, zp(G + 194)), 0.02, mat("#dfe6ea", 0.3, metal=0.8))
    box(1.25, 0.32, 0.5, 0.02, G, 4, mat(team, 0.5, grain=0))
    render("happycity-islamic", (N, N), 200)


MODELS = {
    "happycity-usa": lambda: usa(TEAM["usa"]),
    "happycity-russia": lambda: russia(TEAM["russia"]),
    "happycity-china": lambda: china(TEAM["china"]),
    "happycity-europe": lambda: europe(TEAM["europe"]),
    "happycity-islamic": lambda: islamic(TEAM["islamic"]),
}

"""Airfield (12 × 8, a flat piece: heights not scaled): runway along the back, apron with nine parking spots, control tower in the front corner."""
import kit
from kit import box, cylinder, mat, render, rod, TEAM

W, D = 12, 8
RUNWAY_D = 1.6
ROWS = (3.1, 4.95, 6.8)
SLOTS = [(u, v) for v in ROWS for u in (2, 6, 10)]
LANES = (2.4, 4.1, 5.95)

GROUNDS = {
    "usa": ("#8a8e90", "#8b9095", "#b4bac0"),
    "europe": ("#8a8e90", "#8b9095", "#b4bac0"),
    "russia": ("#7e7c6c", "#86847a", "#9a9880"),
    "china": ("#7e7c6c", "#86847a", "#9a9880"),
    "islamic": ("#a8987a", "#a49a86", "#c2ac86"),
}


def paint(u0, v0, u1, v1, color="#d4d2c8", z=2.0):
    box(u0, v0, u1 - u0, v1 - v0, z, 0.12, mat(color, 0.7, grain=0.25, scale=40))


def tower(tu, tv, body, team):
    base = mat(body, 0.85, grain=0.1)
    box(tu - 0.3, tv - 0.3, 0.6, 0.6, 2, 5, mat(body, 0.9, grain=0.12), bevel=0.01)
    box(tu - 0.17, tv - 0.17, 0.34, 0.34, 7, 19, base, bevel=0.01)
    for k in range(4):  # stair-well slit windows
        box(tu - 0.06, tv + 0.172, 0.12, 0.005, 9 + k * 4.2, 2.2, mat("#2b3b48", 0.2, grain=0))
    box(tu - 0.36, tv - 0.36, 0.72, 0.72, 26, 1.2, mat("#4a4e54", 0.6, metal=0.5))
    glass = mat("#41627a", 0.1, grain=0, glass=True)
    box(tu - 0.31, tv - 0.31, 0.62, 0.62, 27.2, 5.6, glass)
    frame = mat("#c8ccd0", 0.5, metal=0.4, grain=0)
    for a in (-0.31, -0.1, 0.1, 0.31):
        for b in (-0.31, 0.31):
            box(tu + a - 0.012, tv + b - 0.012, 0.024, 0.024, 27.2, 5.6, frame)
            box(tu + b - 0.012, tv + a - 0.012, 0.024, 0.024, 27.2, 5.6, frame)
    box(tu - 0.38, tv - 0.38, 0.76, 0.76, 32.8, 1.6, mat(team, 0.55, grain=0.05))
    box(tu - 0.34, tv - 0.34, 0.68, 0.68, 34.4, 0.6, mat("#3a3a3c", 0.9, grain=0.1))
    rail = mat("#5c5f62", 0.5, metal=0.6, grain=0)
    for a, b in [((-1, -1), (1, -1)), ((-1, 1), (1, 1)), ((-1, -1), (-1, 1)), ((1, -1), (1, 1))]:
        r = 0.36
        rod((tu + a[0] * r, tv + a[1] * r, kit.zp(36.2)), (tu + b[0] * r, tv + b[1] * r, kit.zp(36.2)), 0.006, rail, 4)
    mast = mat("#c0c0c0", 0.4, metal=0.8, grain=0)
    rod((tu, tv, kit.zp(35)), (tu, tv, kit.zp(45)), 0.012, mast)
    box(tu + 0.1, tv - 0.15, 0.14, 0.14, 35, 3, mat("#e8e8e4", 0.6))  # radar box
    cylinder(tu, tv, 0.03, 44.5, 1.2, mat("#ff3b30", 0.3, grain=0))


def airfield(faction):
    kit.ZS = 1.0
    ground, apron, body = GROUNDS[faction]
    team = TEAM[faction]
    kit.bpy.context.scene.cycles.samples = 48
    # Paved block.
    box(0, 0, W, D, 0, 1.9, mat(ground, 0.95, grain=0.2, scale=10))
    # Runway: dark asphalt with edge lines, centre dashes, thresholds and touchdown marks.
    box(0, 0, W, RUNWAY_D, 1.9, 0.1, mat("#3a3c40", 0.92, grain=0.25, scale=14))
    paint(0, 0.06, W, 0.12)
    paint(0, RUNWAY_D - 0.12, W, RUNWAY_D - 0.06)
    mid = RUNWAY_D / 2
    u = 0.6
    while u < W - 0.7:
        paint(u, mid - 0.04, u + 0.5, mid + 0.04)
        u += 0.9
    for u0 in (0.15, W - 0.3):
        for k in range(4):
            paint(u0, 0.22 + k * 0.33, u0 + 0.15, 0.4 + k * 0.33)
    for u0 in (1.1, W - 1.6):
        for v0 in (0.3, RUNWAY_D - 0.42):
            paint(u0, v0, u0 + 0.5, v0 + 0.12)
    # Rubber skid marks near both ends.
    for u0 in (1.0, W - 2.6):
        box(u0, mid - 0.25, 1.6, 0.5, 2.0, 0.06, mat("#2a2b2d", 0.95, grain=0.4, scale=30))
    # Apron: concrete slabs with expansion joints.
    box(0.15, RUNWAY_D, W - 0.3, D - 0.12 - RUNWAY_D, 1.9, 0.1, mat(apron, 0.9, grain=0.22, scale=12))
    joint = mat("#55585a", 0.95, grain=0)
    for k in range(1, 12):
        box(k, RUNWAY_D, 0.012, D - 0.12 - RUNWAY_D, 2.0, 0.03, joint)
    v = RUNWAY_D + 0.8
    while v < D - 0.2:
        box(0.15, v, W - 0.3, 0.012, 2.0, 0.03, joint)
        v += 0.8
    paint(0.15, RUNWAY_D + 0.02, W - 0.15, RUNWAY_D + 0.08)
    taxi = "#c4a83a"
    for lv in LANES:
        paint(0.5, lv - 0.04, W - 0.5, lv + 0.04, taxi)
    for lu in (0.5, W - 0.5):
        paint(lu - 0.04, LANES[0], lu + 0.04, LANES[2], taxi)
    for su, sv in SLOTS:
        lane = LANES[0] if sv < 4 else LANES[1] if sv < 5.5 else LANES[2]
        paint(su - 0.04, lane, su + 0.04, sv - 0.45, taxi)
        u0, v0, u1, v1, t = su - 1.25, sv - 0.45, su + 1.25, sv + 0.42, 0.04
        paint(u0, v0, u1, v0 + t)
        paint(u0, v1 - t, u1, v1)
        paint(u0, v0, u0 + t, v1)
        paint(u1 - t, v0, u1, v1)
        # Team-colour stand marker at the head of each spot, oil stain in the middle.
        paint(su - 0.18, sv + 0.28, su + 0.18, sv + 0.36, team)
        box(su - 0.25, sv - 0.12, 0.5, 0.24, 2.0, 0.05, mat("#74777a", 0.95, grain=0.6, scale=25))
    # Runway edge light fixtures.
    fix = mat("#d8d4c0", 0.5, grain=0)
    u = 0.15
    while u < W:
        for lv in (0.03, RUNWAY_D - 0.03):
            cylinder(u, lv, 0.025, 2.0, 0.6, fix, segs=8)
        u += 1.1
    # Fuel point by the front edge: two small tanks in a low bund.
    box(3.4, 7.3, 1.2, 0.55, 2, 1.2, mat("#9a9a94", 0.9, grain=0.15))
    tank = mat("#d6d6d0", 0.5, metal=0.3, grain=0.05)
    for cu in (3.7, 4.3):
        cylinder(cu, 7.57, 0.2, 3.2, 6, tank)
        cylinder(cu, 7.57, 0.21, 7.4, 0.8, mat(team, 0.5, grain=0))
    # Windsock by the runway end.
    rod((0.35, 1.75, kit.zp(2)), (0.35, 1.75, kit.zp(14)), 0.01, mat("#c0c0c0", 0.4, metal=0.8, grain=0))
    rod((0.35, 1.75, kit.zp(13.5)), (0.65, 1.8, kit.zp(12.5)), 0.03, mat("#f06a1a", 0.7, grain=0))
    tower(W - 0.6, D - 0.6, body, team)
    render(f"airfield-{faction}", (W, D), 60)
    kit.ZS = 1.35


MODELS = {f"airfield-{f}": (lambda f=f: airfield(f)) for f in TEAM}

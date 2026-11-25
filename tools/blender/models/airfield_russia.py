"""Russia-pattern airfield (12 × 8, a flat piece: heights not scaled). Longoria (China) shows this same russia picture with
its team line recoloured in the game; the Islamic nations (Lunastron) get their own render on sand ground.

Layout (tile u right, v down; must match ui/src/render/sprites/Airfield.ts RUSSIA_LAYOUT):
- Runway down the middle along v, as long as the airfield is wide: u ∈ [5.2, 6.8], v ∈ [0, 8], centre line u = 6.
- West apron u ∈ [0.15, 5.0]: two columns of stands (u = 1.4, 3.6) × three rows (v = 1.4, 4.0, 6.6).
- East apron u ∈ [7.0, 11.85]: one column of stands (u = 8.4) × the same three rows, then the support strip
  (fuel point, hardened hangar, control tower) along the east edge.
- Nine stands, aircraft parked nose along the runway (v).
Team colour (TEAM["russia"]) only on the identity line: stand markers, runway-side band on both aprons, tower band,
hangar door stripe and fuel-tank caps, so a captured airfield can be recoloured to the new owner.

ART_GUIDE detail pass (layout unchanged): tower shaft with framed windows on both visible faces, floor bands, a door
with a canopy and steps, a drip edge under the cab, consoles behind the glass, louvres, a radar dish and VHF whips;
hardened shelter with formwork joints and drip edges on every tier, roof vents, door rails and ribs, a blast
deflector wall; fuel point with a bund wall, ladders, valves, a manifold, a pump house and a hose stand; runway tyre
marks, threshold (green) and end (red) lights, PAPI units; tie-down points on every stand; floodlight masts.
"""
import kit
from kit import box, cylinder, mat, render, rod, TEAM

W, D = 12, 8
RW0, RW1 = 5.2, 6.8  # runway edges (u)
CU = 6.0  # runway centre line
COLS_W = (1.4, 3.6)
COL_E = 8.4
ROWS = (1.4, 4.0, 6.6)
SLOTS = [(u, v) for v in ROWS for u in (*COLS_W, COL_E)]
LANE_W = 4.65  # west taxi lane (u)
LANE_E = 7.35  # east taxi lane (u)

NATIONS = ("russia", "islamic")  # Longoria uses the russia picture, its team line recoloured in the game (Airfield.ts)
GROUNDS = {
    "russia": ("#7e7c6c", "#86847a", "#9a9880"),
    "china": ("#7e7c6c", "#86847a", "#9a9880"),
    "islamic": ("#a8987a", "#a49a86", "#c2ac86"),
}
GROUND, APRON, BODY = GROUNDS["russia"]


def paint(u0, v0, u1, v1, color="#d4d2c8", z=2.0):
    box(u0, v0, u1 - u0, v1 - v0, z, 0.12, mat(color, 0.7, grain=0.25, scale=40))


def tower(tu, tv, team):
    """Soviet-style control tower: square shaft, glazed cab, team-colour band under the roof."""
    base = mat(BODY, 0.85, grain=0.1)
    box(tu - 0.3, tv - 0.3, 0.6, 0.6, 2, 5, mat(BODY, 0.9, grain=0.12), bevel=0.01)
    box(tu - 0.17, tv - 0.17, 0.34, 0.34, 7, 19, base, bevel=0.01)
    glass = mat("#2b3b48", 0.15, grain=0, glass=True)
    trim = mat("#c8c6bc", 0.7, grain=0.04)
    for k in range(4):  # framed windows on both visible faces
        box(tu - 0.07, tv + 0.17, 0.14, 0.012, 9 + k * 4.2 - 0.4, 3.0, trim)
        box(tu - 0.06, tv + 0.18, 0.12, 0.005, 9 + k * 4.2, 2.2, glass)
        box(tu - 0.08, tv + 0.17, 0.16, 0.02, 9 + k * 4.2 - 0.8, 0.4, trim)
        box(tu + 0.17, tv - 0.07, 0.012, 0.14, 9 + k * 4.2 - 0.4, 3.0, trim)
        box(tu + 0.18, tv - 0.06, 0.005, 0.12, 9 + k * 4.2, 2.2, glass)
        box(tu + 0.17, tv - 0.08, 0.02, 0.16, 9 + k * 4.2 - 0.8, 0.4, trim)
    for k in range(1, 4):  # floor bands
        box(tu - 0.175, tv - 0.175, 0.35, 0.35, 7 + k * 4.75, 0.4, mat("#8c8a7c", 0.85, grain=0.08))
    box(tu - 0.31, tv - 0.31, 0.62, 0.62, 6.6, 0.4, trim)  # base cornice
    box(tu - 0.09, tv + 0.3, 0.18, 0.012, 2, 3.6, mat("#3a3c3e", 0.6, metal=0.4, grain=0))  # door
    box(tu - 0.13, tv + 0.3, 0.26, 0.1, 5.8, 0.4, trim)  # canopy
    for k in range(2):  # steps
        box(tu - 0.1, tv + 0.3 + k * 0.05, 0.2, 0.05, 1.9, 0.5 - k * 0.25, trim)
    box(tu - 0.36, tv - 0.36, 0.72, 0.72, 26, 1.2, mat("#4a4e54", 0.6, metal=0.5))
    box(tu - 0.37, tv - 0.37, 0.74, 0.74, 25.6, 0.4, mat("#3a3c3e", 0.6, metal=0.5))  # drip edge
    for a in (-0.2, 0.0, 0.2):  # consoles seen through the glass
        box(tu + a - 0.05, tv + 0.2, 0.1, 0.06, 27.2, 1.4, mat("#2a2c2e", 0.6, grain=0))
        box(tu + 0.2, tv + a - 0.05, 0.06, 0.1, 27.2, 1.4, mat("#2a2c2e", 0.6, grain=0))
    box(tu - 0.31, tv - 0.31, 0.62, 0.62, 27.2, 5.6, mat("#41627a", 0.1, grain=0, glass=True))
    frame = mat("#c8ccd0", 0.5, metal=0.4, grain=0)
    for a in (-0.31, -0.1, 0.1, 0.31):
        for b in (-0.31, 0.31):
            box(tu + a - 0.012, tv + b - 0.012, 0.024, 0.024, 27.2, 5.6, frame)
            box(tu + b - 0.012, tv + a - 0.012, 0.024, 0.024, 27.2, 5.6, frame)
    box(tu - 0.38, tv - 0.38, 0.76, 0.76, 32.8, 1.6, mat(team, 0.55, grain=0.05))  # team line
    box(tu - 0.34, tv - 0.34, 0.68, 0.68, 34.4, 0.6, mat("#3a3a3c", 0.9, grain=0.1))
    rail = mat("#5c5f62", 0.5, metal=0.6, grain=0)
    r = 0.36
    for a, b in [((-1, -1), (1, -1)), ((-1, 1), (1, 1)), ((-1, -1), (-1, 1)), ((1, -1), (1, 1))]:
        rod((tu + a[0] * r, tv + a[1] * r, kit.zp(36.2)), (tu + b[0] * r, tv + b[1] * r, kit.zp(36.2)), 0.006, rail, 4)
    rod((tu, tv, kit.zp(35)), (tu, tv, kit.zp(45)), 0.012, mat("#c0c0c0", 0.4, metal=0.8, grain=0))
    box(tu + 0.1, tv - 0.15, 0.14, 0.14, 35, 3, mat("#e8e8e4", 0.6))
    for k in range(5):  # louvres on the equipment box
        box(tu + 0.24, tv - 0.14 + k * 0.026, 0.004, 0.014, 35.5, 2.0, mat("#55585a", 0.5, metal=0.5, grain=0))
    # Radar dish on a stub and two VHF whips.
    cylinder(tu - 0.18, tv - 0.18, 0.02, 35, 2.4, mat("#9a9c9e", 0.4, metal=0.7, grain=0), 8)
    rod((tu - 0.18, tv - 0.18, kit.zp(38.4)), (tu - 0.165, tv - 0.165, kit.zp(38.7)), 0.09, mat("#e4e4e0", 0.5, grain=0), 20)
    for du in (-0.25, 0.25):
        rod((tu + du, tv + 0.25, kit.zp(35)), (tu + du, tv + 0.25, kit.zp(41)), 0.004, mat("#2a2a2a", 0.5, metal=0.5, grain=0))
    cylinder(tu, tv, 0.03, 44.5, 1.2, mat("#ff3b30", 0.3, grain=0))


def hangar(u0, v0, du, dv, team):
    """Hardened aircraft shelter: low concrete vault, dark door facing the runway side (west), team stripe over it."""
    concrete = mat("#8e8c80", 0.95, grain=0.25, scale=12)
    box(u0, v0, du, dv, 2, 4, concrete, bevel=0.03)
    box(u0 + 0.08, v0 + 0.08, du - 0.16, dv - 0.16, 6, 2.2, concrete, bevel=0.05)
    box(u0 + 0.2, v0 + 0.2, du - 0.4, dv - 0.4, 8.2, 1.2, concrete, bevel=0.06)
    box(u0 - 0.01, v0 + 0.25, 0.02, dv - 0.5, 2, 5, mat("#2e3032", 0.9, grain=0.1))  # door
    for k in range(1, 4):
        box(u0 - 0.015, v0 + 0.25 + k * (dv - 0.5) / 4 - 0.01, 0.01, 0.02, 2, 5, mat("#55585a", 0.6, metal=0.4, grain=0))
    box(u0 - 0.02, v0 + 0.2, 0.03, dv - 0.4, 7, 0.9, mat(team, 0.55, grain=0.05))  # team line
    joint = mat("#6e6c62", 0.95, grain=0)
    for (a, b, w, d, z) in ((u0, v0, du, dv, 6), (u0 + 0.08, v0 + 0.08, du - 0.16, dv - 0.16, 8.2), (u0 + 0.2, v0 + 0.2, du - 0.4, dv - 0.4, 9.4)):
        n = max(2, int(d / 0.3))
        for k in range(1, n):  # formwork joints across every tier top and down its visible side
            box(a, b + k * d / n - 0.004, w, 0.008, z, 0.08, joint)
            box(a + w, b + k * d / n - 0.004, 0.004, 0.008, z - 2, 2, joint)
        box(a - 0.008, b - 0.008, w + 0.016, d + 0.016, z - 0.6, 0.35, mat("#7a786e", 0.9, grain=0.15))  # drip edge
    for k in range(3):  # roof vents
        cylinder(u0 + du / 2, v0 + 0.5 + k * (dv - 1.0) / 2, 0.05, 10.6, 1.8, mat("#7c7e80", 0.5, metal=0.6, grain=0), 12)
        cylinder(u0 + du / 2, v0 + 0.5 + k * (dv - 1.0) / 2, 0.07, 12.4, 0.4, mat("#55585a", 0.5, metal=0.6, grain=0), 12)
    rail = mat("#55585a", 0.6, metal=0.5, grain=0)
    box(u0 - 0.08, v0 + 0.15, 0.06, dv - 0.3, 2, 0.15, rail)  # door rails
    box(u0 - 0.03, v0 + 0.15, 0.02, dv - 0.3, 6.9, 0.3, rail)
    for k in range(4):  # door panel ribs
        for z in (3.0, 4.5):
            box(u0 - 0.016, v0 + 0.27 + k * (dv - 0.5) / 4, 0.006, (dv - 0.5) / 4 - 0.04, z, 0.2, rail)
    # Blast deflector wall behind the shelter (east).
    box(u0 + du + 0.15, v0 + 0.3, 0.12, dv - 0.6, 2, 4.5, concrete, bevel=0.02)
    for k in range(1, 5):
        box(u0 + du + 0.27, v0 + 0.3 + k * (dv - 0.6) / 5 - 0.004, 0.004, 0.008, 2, 4.5, joint)


def airfield_russia(faction="russia"):
    global GROUND, APRON, BODY
    GROUND, APRON, BODY = GROUNDS[faction]
    kit.ZS = 1.0
    team = TEAM[faction]
    kit.bpy.context.scene.cycles.samples = 48
    box(0, 0, W, D, 0, 1.9, mat(GROUND, 0.95, grain=0.2, scale=10))
    # Runway along v: asphalt, edge lines, centre dashes, threshold bars and touchdown marks at both ends.
    box(RW0, 0, RW1 - RW0, D, 1.9, 0.1, mat("#3a3c40", 0.92, grain=0.25, scale=14))
    paint(RW0 + 0.06, 0, RW0 + 0.12, D)
    paint(RW1 - 0.12, 0, RW1 - 0.06, D)
    v = 0.9
    while v < D - 0.9:
        paint(CU - 0.04, v, CU + 0.04, v + 0.45)
        v += 0.8
    for v0 in (0.12, D - 0.27):
        for k in range(4):
            paint(RW0 + 0.22 + k * 0.33, v0, RW0 + 0.4 + k * 0.33, v0 + 0.15)
    for v0 in (0.8, D - 1.3):
        for u0 in (RW0 + 0.3, RW1 - 0.42):
            paint(u0, v0, u0 + 0.12, v0 + 0.5)
    for v0 in (0.7, D - 2.3):
        box(CU - 0.25, v0, 0.5, 1.6, 2.0, 0.06, mat("#2a2b2d", 0.95, grain=0.4, scale=30))
    # Aprons either side, concrete slabs with expansion joints.
    apron = mat(APRON, 0.9, grain=0.22, scale=12)
    joint = mat("#55585a", 0.95, grain=0)
    for a0, a1 in ((0.15, 5.0), (7.0, 11.85)):
        box(a0, 0.15, a1 - a0, D - 0.3, 1.9, 0.1, apron)
        u = a0 + 0.8
        while u < a1 - 0.1:
            box(u, 0.15, 0.012, D - 0.3, 2.0, 0.03, joint)
            u += 0.8
        v = 0.95
        while v < D - 0.2:
            box(a0, v, a1 - a0, 0.012, 2.0, 0.03, joint)
            v += 0.8
    # Team identity line along both apron edges facing the runway.
    paint(4.92, 0.15, 5.0, D - 0.15, team)
    paint(7.0, 0.15, 7.08, D - 0.15, team)
    # Taxi lanes (yellow) and the links onto the runway.
    taxi = "#c4a83a"
    paint(LANE_W - 0.04, 0.6, LANE_W + 0.04, D - 0.6, taxi)
    paint(LANE_E - 0.04, 0.6, LANE_E + 0.04, D - 0.6, taxi)
    for lv in (0.6, D - 0.6):
        paint(LANE_W, lv - 0.04, RW0, lv + 0.04, taxi)
        paint(RW1, lv - 0.04, LANE_E, lv + 0.04, taxi)
    # Lead-in lines: one per row and side, from the outermost stand to its lane (no overlapping coplanar strips).
    for sv in ROWS:
        paint(COLS_W[0], sv - 0.04, LANE_W, sv + 0.04, taxi, z=2.03)
        paint(LANE_E, sv - 0.04, COL_E, sv + 0.04, taxi, z=2.03)
    # Stands: outline, lead-in line from the lane, team marker at the head, oil stain.
    for su, sv in SLOTS:
        u0, v0, u1, v1, t = su - 0.75, sv - 1.0, su + 0.75, sv + 1.0, 0.04
        paint(u0, v0, u1, v0 + t)
        paint(u0, v1 - t, u1, v1)
        paint(u0, v0, u0 + t, v1)
        paint(u1 - t, v0, u1, v1)
        paint(su - 0.18, v0 + 0.1, su + 0.18, v0 + 0.2, team)  # team line
        box(su - 0.12, sv - 0.25, 0.24, 0.5, 2.0, 0.05, mat("#74777a", 0.95, grain=0.6, scale=25))
    # Tyre marks in the touchdown zones, threshold (green) and end (red) lights, PAPI units.
    rubber = mat("#232426", 0.95, grain=0.5, scale=40)
    for v0 in (0.6, D - 2.4):
        for k in range(9):
            du = (k % 3 - 1) * 0.14 + (k // 3 - 1) * 0.03
            box(CU + du - 0.025, v0 + k * 0.17, 0.05, 0.12 + (k % 2) * 0.06, 2.06, 0.02, rubber)
    for vv, col in ((0.05, "#3cd65a"), (D - 0.05, "#e03a2a")):
        for k in range(8):
            cylinder(RW0 + 0.15 + k * 0.186, vv, 0.022, 2.0, 0.5, mat(col, 0.3, grain=0, emit=col), segs=8)
    for pv in (1.3, D - 1.3):
        for k in range(4):
            box(RW0 - 0.45 + k * 0.09, pv, 0.06, 0.05, 2.0, 1.0, mat("#d8d4c0", 0.5, grain=0))
            box(RW0 - 0.44 + k * 0.09, pv + 0.05, 0.04, 0.004, 2.3, 0.4, mat("#fff6e0", 0.3, grain=0, emit="#fff6e0"))
    # Tie-down points on every stand.
    tie = mat("#4a4c4e", 0.6, metal=0.5, grain=0)
    for su, sv in SLOTS:
        for du, dv in ((-0.5, 0.2), (0.5, 0.2), (0.0, 0.8)):
            cylinder(su + du, sv + dv, 0.025, 2.0, 0.12, tie, segs=8)
    # Runway edge lights.
    fix = mat("#d8d4c0", 0.5, grain=0)
    v = 0.15
    while v < D:
        for lu in (RW0 + 0.03, RW1 - 0.03):
            cylinder(lu, v, 0.025, 2.0, 0.6, fix, segs=8)
        v += 1.1
    # Support strip on the east edge: fuel point, hardened shelter, control tower.
    box(9.9, 0.5, 1.6, 1.0, 2, 1.2, mat("#9a9a94", 0.9, grain=0.15))
    tank = mat("#d6d6d0", 0.5, metal=0.3, grain=0.05)
    for cu in (10.3, 11.1):
        cylinder(cu, 1.0, 0.28, 3.2, 6, tank)
        cylinder(cu, 1.0, 0.29, 7.4, 0.8, mat(team, 0.5, grain=0))  # team line
    bund = mat("#8a8a82", 0.9, grain=0.15)
    for bx in ((9.9, 0.5, 1.6, 0.05), (9.9, 1.45, 1.6, 0.05), (9.9, 0.5, 0.05, 1.0), (11.45, 0.5, 0.05, 1.0)):
        box(*bx, 3.2, 1.4, bund)  # bund wall
    steel = mat("#8f9396", 0.4, metal=0.7, grain=0.03)
    for cu in (10.3, 11.1):
        for k in range(6):  # tank ladder rungs
            rod((cu + 0.2, 1.27, kit.zp(3.6 + k)), (cu + 0.26, 1.27, kit.zp(3.6 + k)), 0.004, steel, 4)
        rod((cu, 1.28, kit.zp(4.0)), (cu, 1.62, kit.zp(4.0)), 0.02, steel, 8)  # outlet pipe
        cylinder(cu, 1.6, 0.035, 3.2, 1.6, mat("#c03a2a", 0.5, grain=0), 10)  # valve
    rod((10.3, 1.62, kit.zp(4.0)), (11.1, 1.62, kit.zp(4.0)), 0.02, steel, 8)  # manifold
    box(10.55, 1.7, 0.3, 0.22, 2, 4.2, mat("#b8b6ae", 0.8, grain=0.08))  # pump house
    box(10.53, 1.68, 0.34, 0.26, 6.2, 0.4, mat("#55585a", 0.7, grain=0))
    box(10.62, 1.92, 0.12, 0.006, 2, 3.0, mat("#3a3c3e", 0.6, metal=0.4, grain=0))
    cylinder(11.3, 1.85, 0.03, 2, 4.5, steel, 8)  # hose stand
    rod((11.3, 1.85, kit.zp(6.0)), (11.38, 1.95, kit.zp(3.0)), 0.012, mat("#1e1e1e", 0.8, grain=0), 6)
    hangar(10.0, 2.4, 1.6, 2.6, team)
    # Floodlight masts by the support strip.
    for fu, fv in ((9.7, 2.0), (9.7, 5.6)):
        rod((fu, fv, kit.zp(2)), (fu, fv, kit.zp(20)), 0.014, steel, 8)
        box(fu - 0.08, fv - 0.04, 0.16, 0.08, 20, 1.6, mat("#e8e2c0", 0.4, grain=0, emit="#fff0c0"))
    tower(11.2, 7.1, team)
    # Windsock at the north runway end.
    rod((RW1 + 0.25, 0.35, kit.zp(2)), (RW1 + 0.25, 0.35, kit.zp(14)), 0.01, mat("#c0c0c0", 0.4, metal=0.8, grain=0))
    rod((RW1 + 0.25, 0.35, kit.zp(13.5)), (RW1 + 0.3, 0.65, kit.zp(12.5)), 0.03, mat("#f06a1a", 0.7, grain=0))
    render(f"airfield-{faction}", (W, D), 60)
    kit.ZS = 1.35


MODELS = {f"airfield-{f}": (lambda f=f: airfield_russia(f)) for f in NATIONS}

from models._wreck import with_damage  # noqa: E402

with_damage(MODELS, __name__, flat=True)

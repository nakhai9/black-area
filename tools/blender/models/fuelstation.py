"""Fuel Station (10 × 8, a flat piece: heights not scaled), after a modern highway filling station: a deep canopy in
the nation's colour (white band, lit underside) on 4 columns over 3 pump islands, a glass-fronted shop, a tall price
pylon with a generic fuel-drop emblem (no real-world brand), plus military parking: 3 aircraft stands along the back,
2 helipads and a 6-bay lot for any ground vehicle.

Layout (u across, v towards the viewer; the camera sees the +u / +v faces):
    v 0.15-2.85   3 aircraft stands (u centres 1.7 / 5.0 / 8.3)
    v 3.05-5.45   2 helipads (u 1.35 / 3.95) | fuel canopy with 3 pump islands (u 5.5-9.8)
    v 5.7-7.85    shop (u 0.25-3.25) | 6-bay vehicle lot (u 3.6-9.8)
"""
import math

import kit
from kit import box, cylinder, lathe, mat, render, rod, TEAM

W, D = 10, 8
GROUNDS = {
    "usa": ("#8c9093", "#3b3d40"),
    "europe": ("#8c9093", "#3b3d40"),
    "russia": ("#82806f", "#3d3d3a"),
    "china": ("#82806f", "#3d3d3a"),
    "islamic": ("#aa9a7c", "#46423b"),
}
WHITE = "#e6e4dc"
YELLOW = "#d6b232"


def paint(u0, v0, u1, v1, color=WHITE, z=2.0):
    box(u0, v0, u1 - u0, v1 - v0, z, 0.12, mat(color, 0.7, grain=0.25, scale=40))


def outline(u0, v0, u1, v1, t=0.045, color=WHITE):
    paint(u0, v0, u1, v0 + t, color)
    paint(u0, v1 - t, u1, v1, color)
    paint(u0, v0, u0 + t, v1, color)
    paint(u1 - t, v0, u1, v1, color)


def aircraft_stand(cu, team):
    """Concrete stand: white box, yellow lead-in line with a stop bar, team-colour stand plate, tie-down points."""
    box(cu - 1.5, 0.15, 3.0, 2.7, 1.9, 0.1, mat("#9a9c9c", 0.9, grain=0.2, scale=12))
    for k in range(1, 3):  # slab joints
        box(cu - 1.5, 0.15 + k * 0.9, 3.0, 0.012, 2.0, 0.03, mat("#5c5f61", 0.95, grain=0))
    outline(cu - 1.42, 0.22, cu + 1.42, 2.78)
    paint(cu - 0.04, 0.4, cu + 0.04, 2.7, YELLOW)
    paint(cu - 0.35, 0.4, cu + 0.35, 0.48, YELLOW)
    paint(cu - 0.2, 2.5, cu + 0.2, 2.62, team)
    box(cu - 0.3, 1.2, 0.6, 0.35, 2.0, 0.05, mat("#74777a", 0.95, grain=0.6, scale=25))  # oil stain
    tie = mat("#3e4042", 0.6, metal=0.6, grain=0)
    for du in (-0.9, 0.9):
        for v in (0.9, 1.9):
            cylinder(cu + du, v, 0.03, 2.0, 0.3, tie, segs=8)


def helipad(cu, cv):
    """Square pad: yellow touchdown ring, white H, corner lights."""
    box(cu - 1.2, cv - 1.2, 2.4, 2.4, 1.9, 0.1, mat("#7d8082", 0.9, grain=0.2, scale=12))
    outline(cu - 1.15, cv - 1.15, cu + 1.15, cv + 1.15)
    ring = mat(YELLOW, 0.7, grain=0.2, scale=40)
    lathe(cu, cv, 2.0, [(0.95, 0), (0.95, 0.14), (0.85, 0.14), (0.85, 0)], ring, segs=64, cap_top=False)
    box(cu - 0.85, cv - 0.85, 1.7, 1.7, 2.0, 0.001, mat("#7d8082", 0.9, grain=0.2, scale=12))
    paint(cu - 0.42, cv - 0.38, cu - 0.3, cv + 0.38)
    paint(cu + 0.3, cv - 0.38, cu + 0.42, cv + 0.38)
    paint(cu - 0.3, cv - 0.06, cu + 0.3, cv + 0.06)
    lamp = mat("#e0e6c8", 0.3, grain=0, emit="#c8e070")
    for du in (-1.08, 1.08):
        for dv in (-1.08, 1.08):
            cylinder(cu + du, cv + dv, 0.04, 2.0, 0.6, lamp, segs=10)


def dispenser(cu, cv, team):
    body = mat("#d8d8d2", 0.5, grain=0.05)
    box(cu - 0.09, cv - 0.15, 0.18, 0.3, 3.0, 5.6, body, bevel=0.01)
    box(cu - 0.095, cv - 0.155, 0.19, 0.31, 8.6, 1.0, mat(team, 0.45, grain=0.05))
    box(cu + 0.09, cv - 0.09, 0.006, 0.18, 6.0, 1.6, mat("#202830", 0.15, grain=0, emit="#5a8aa8"))  # price screen
    hose = mat("#1c1c1c", 0.6, grain=0)
    for dv in (-0.12, 0.12):
        rod((cu + 0.1, cv + dv, kit.zp(7.0)), (cu + 0.16, cv + dv, kit.zp(4.0)), 0.008, hose, 5)
        box(cu + 0.1, cv + dv - 0.02, 0.06, 0.04, 6.6, 0.6, mat("#303030", 0.5, grain=0))  # nozzle


def canopy(team):
    u0, u1, v0, v1 = 5.5, 9.8, 3.05, 5.45
    box(u0, v0, u1 - u0, v1 - v0, 1.9, 0.1, mat("#9fa1a0", 0.85, grain=0.18, scale=14))  # forecourt concrete
    island = mat("#b8b8b2", 0.8, grain=0.1)
    kerb = mat(YELLOW, 0.7, grain=0.1)
    for cu in (6.25, 7.65, 9.05):
        box(cu - 0.17, v0 + 0.35, 0.34, 1.7, 2.0, 1.0, island, bevel=0.01)
        box(cu - 0.18, v0 + 0.33, 0.36, 0.06, 2.0, 1.1, kerb)
        box(cu - 0.18, v0 + 2.01, 0.36, 0.06, 2.0, 1.1, kerb)
        for cv in (v0 + 0.75, v0 + 1.65):
            dispenser(cu, cv, team)
        # crash bollards at the island ends
        for cv in (v0 + 0.42, v0 + 1.98):
            cylinder(cu, cv, 0.035, 3.0, 2.6, mat(YELLOW, 0.6, grain=0.05), segs=10)
    col = mat("#e8e8e4", 0.55, grain=0.05)
    for cu in (6.95, 8.35):
        for cv in (v0 + 0.55, v0 + 1.85):
            box(cu - 0.09, cv - 0.09, 0.18, 0.18, 2.0, 18.0, col, bevel=0.015)
            box(cu - 0.11, cv - 0.11, 0.22, 0.22, 2.0, 1.2, mat(team, 0.5, grain=0.05))
    # roof slab: white underside with light panels, deep fascia (team colour with a white band), flat top
    z = 20.0
    box(u0 - 0.1, v0 - 0.1, u1 - u0 + 0.2, v1 - v0 + 0.2, z, 0.6, mat("#e9e9e4", 0.6, grain=0.03))
    light = mat("#fdfdf4", 0.3, grain=0, emit="#fffbe8")
    for cu in (6.25, 7.65, 9.05):
        for cv in (v0 + 0.6, v0 + 1.2, v0 + 1.8):
            box(cu - 0.18, cv - 0.12, 0.36, 0.24, z - 0.05, 0.05, light)
    box(u0 - 0.14, v0 - 0.14, u1 - u0 + 0.28, v1 - v0 + 0.28, z + 0.6, 8.0, mat(team, 0.45, grain=0.05), bevel=0.02)
    band = mat("#f2f2ee", 0.45, grain=0.02)
    box(u0 - 0.15, v0 - 0.15, u1 - u0 + 0.3, v1 - v0 + 0.3, z + 2.6, 1.6, band)
    box(u0 - 0.1, v0 - 0.1, u1 - u0 + 0.2, v1 - v0 + 0.2, z + 8.6, 0.3, mat("#c4c4be", 0.8, grain=0.1))
    # emblem panels on the two visible fascia faces: white square with a team-colour fuel drop
    for face in ("u", "v"):
        if face == "u":
            box(u1 + 0.14, 4.0, 0.02, 0.5, z + 1.0, 7.4, band)
        else:
            box(7.4, v1 + 0.14, 0.5, 0.02, z + 1.0, 7.4, band)
    drop = mat(team, 0.4, grain=0)
    box(7.55, v1 + 0.16, 0.2, 0.012, z + 2.0, 5.2, drop)
    box(u1 + 0.16, 4.15, 0.012, 0.2, z + 2.0, 5.2, drop)


def pylon(team):
    """Tall price sign by the forecourt: team-colour head with the drop emblem, white price panels, grey legs."""
    pu, pv = 9.7, 5.55
    leg = mat("#8a8c8e", 0.5, metal=0.5, grain=0)
    for dv in (-0.12, 0.12):
        box(pu - 0.04, pv + dv - 0.04, 0.08, 0.08, 2.0, 30.0, leg)
    box(pu - 0.06, pv - 0.22, 0.12, 0.44, 32.0, 8.0, mat(team, 0.45, grain=0.05), bevel=0.01)
    box(pu + 0.06, pv - 0.12, 0.01, 0.24, 34.0, 4.5, mat("#f2f2ee", 0.45, grain=0))
    box(pu + 0.072, pv - 0.05, 0.006, 0.1, 35.0, 2.6, mat(team, 0.4, grain=0))
    panel = mat("#f0f0ea", 0.5, grain=0, emit="#ffffff")
    digit = mat("#b52a22", 0.4, grain=0, emit="#ff4030")
    for k in range(3):
        box(pu - 0.055, pv - 0.2, 0.11, 0.4, 18.0 + k * 4.4, 3.8, panel)
        for j in range(3):
            box(pu + 0.056, pv - 0.12 + j * 0.09, 0.004, 0.06, 18.6 + k * 4.4, 2.4, digit)


def shop(team):
    """Convenience shop: white walls, full glass front (+v), team-colour fascia, flat roof with plant."""
    u0, v0, w, d, h = 0.25, 5.75, 3.0, 2.0, 14.0
    box(u0 - 0.15, v0 - 0.15, w + 0.3, d + 0.35, 1.9, 0.1, mat("#a6a8a6", 0.85, grain=0.15, scale=14))  # apron
    wall = mat("#e2e0d8", 0.85, grain=0.08, scale=16)
    box(u0, v0, w, d, 2.0, h, wall, bevel=0.01)
    glass = mat("#3d5a6e", 0.1, grain=0, glass=True)
    frame = mat("#4a4e52", 0.5, metal=0.5, grain=0)
    box(u0 + 0.15, v0 + d, w - 0.3, 0.012, 2.0, 7.0, glass)
    for k in range(7):
        box(u0 + 0.15 + k * (w - 0.3) / 6 - 0.012, v0 + d, 0.024, 0.02, 2.0, 7.0, frame)
    box(u0 + 1.25, v0 + d + 0.005, 0.5, 0.015, 2.0, 6.0, mat("#2c4050", 0.1, grain=0, glass=True))  # door
    box(u0 + w, v0 + 0.4, 0.012, 1.2, 4.0, 4.0, glass)  # side window
    box(u0 - 0.05, v0 - 0.05, w + 0.1, d + 0.1, h + 2.0 - 2.6, 2.8, mat(team, 0.45, grain=0.05), bevel=0.01)
    box(u0 - 0.06, v0 - 0.06, w + 0.12, d + 0.12, h + 2.0 - 1.8, 0.6, mat("#f2f2ee", 0.45, grain=0.02))
    box(u0 + 0.1, v0 + 0.1, w - 0.2, d - 0.2, h + 2.0, 0.3, mat("#9c9c98", 0.9, grain=0.12))
    ac = mat("#a4a6a8", 0.5, metal=0.4, grain=0.03)
    box(u0 + 0.4, v0 + 0.4, 0.5, 0.4, h + 2.3, 2.2, ac)
    box(u0 + 1.3, v0 + 0.4, 0.5, 0.4, h + 2.3, 2.2, ac)
    # canopy over the door and a bench of air/water by the shop corner
    box(u0 + 1.0, v0 + d, 1.0, 0.35, 9.2, 0.4, mat(team, 0.45, grain=0.05))
    for k in range(3):  # gas cylinder cage
        box(u0 + w + 0.08, v0 + 0.3 + k * 0.25, 0.2, 0.2, 2.0, 3.5, mat("#c8c8c0", 0.6, metal=0.3, grain=0.03))


def vehicle_lot():
    """Six bays for any ground vehicle: asphalt, white bay lines, wheel stops, a kerb with lamp posts."""
    u0, u1, v0, v1 = 3.6, 9.8, 5.7, 7.85
    box(u0, v0, u1 - u0, v1 - v0, 1.9, 0.1, mat("#46484b", 0.92, grain=0.25, scale=14))
    bw = (u1 - u0) / 6
    for k in range(7):
        paint(u0 + k * bw - 0.025, v0 + 0.1, u0 + k * bw + 0.025, v1 - 0.1)
    paint(u0, v0 + 0.08, u1, v0 + 0.13)
    stop = mat("#c8c6be", 0.8, grain=0.1)
    for k in range(6):
        box(u0 + k * bw + 0.25, v1 - 0.35, bw - 0.5, 0.1, 2.0, 0.7, stop)
        paint(u0 + k * bw + bw / 2 - 0.08, v0 + 0.9, u0 + k * bw + bw / 2 + 0.08, v0 + 1.06, YELLOW)
    box(u0, v1 - 0.12, u1 - u0, 0.12, 2.0, 1.0, mat("#b0b0aa", 0.85, grain=0.1))  # kerb
    post = mat("#6a6c6e", 0.5, metal=0.6, grain=0)
    for u in (u0 + 0.1, (u0 + u1) / 2, u1 - 0.1):
        rod((u, v1 - 0.06, kit.zp(2)), (u, v1 - 0.06, kit.zp(13)), 0.018, post, 6)
        box(u - 0.12, v1 - 0.12, 0.24, 0.1, 12.6, 0.5, mat("#f4f2e0", 0.3, grain=0, emit="#fff6d8"))


def fuelstation(faction):
    kit.ZS = 1.0
    ground, asphalt = GROUNDS[faction]
    team = TEAM[faction]
    kit.bpy.context.scene.cycles.samples = 48
    box(0, 0, W, D, 0, 1.9, mat(ground, 0.95, grain=0.2, scale=10))  # paved plot
    # access lanes between the zones
    box(0.1, 2.9, W - 0.2, 0.12, 1.9, 0.1, mat(asphalt, 0.92, grain=0.25, scale=14))
    box(0.1, 5.5, W - 0.2, 0.18, 1.9, 0.1, mat(asphalt, 0.92, grain=0.25, scale=14))
    for cu in (1.7, 5.0, 8.3):
        aircraft_stand(cu, team)
    helipad(1.35, 4.25)
    helipad(3.95, 4.25)
    canopy(team)
    pylon(team)
    shop(team)
    vehicle_lot()
    render(f"fuelstation-{faction}", (W, D), 50)
    kit.ZS = 1.35


MODELS = {f"fuelstation-{f}": (lambda f=f: fuelstation(f)) for f in TEAM}

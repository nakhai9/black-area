"""Parallel Government (4 x 5): each nation's hall rendered on its own (on a 1.8 x 3.4 lot starting at u = 0, v = 0.3,
standing on the paving at z = 2) so any holder/host pair can be composed in the game, plus the paved plot."""
import math

from kit import box, cylinder, dome, lathe, mat, render, rod, roof, windows, zp, TEAM
from models.allied import GOLD, columns_u, cornice, door, facade, flat_roof, glass, minaret, parapet, steps

HEIGHT = {"usa": 58, "russia": 60, "china": 44, "europe": 56, "islamic": 62}


def usa(team):
    BRICK = mat("#8e4434", 0.9, grain=0.18, scale=40)
    TRIM = mat("#eeeae0", 0.7, grain=0.05)
    box(0, 0.4, 1.8, 3.2, 2, 2, mat("#bdb8ac", 0.85))
    box(0.1, 0.5, 1.6, 3.0, 4, 14, BRICK)
    facade(0.1, 0.5, 1.6, 3.0, 4, 14, 5, 8, 2, TRIM, fill=0.45)
    box(0.09, 0.49, 1.62, 3.02, 10.6, 0.5, TRIM)
    cornice(0.1, 0.5, 1.6, 3.0, 18, 1, TRIM)
    roof(0.1, 0.5, 1.6, 3.0, 19, 6, mat("#4d4f55", 0.8, grain=0.1), kind="gable", ridge="v", overhang=0.06)
    # Front pediment trim and portico with steps and a door.
    box(0.55, 3.5, 0.7, 0.12, 4, 12, TRIM)
    columns_u(0.6, 1.2, 3.68, 4, 4, 12, 0.03, TRIM)
    box(0.5, 3.48, 0.8, 0.28, 16, 1.5, TRIM)
    steps(0.5, 3.76, 0.8, 2, 2, 0.06, 1, mat("#cfcac0", 0.8))
    door("left", 0.1, 0.5, 1.6, 3.0, 4, 0.43, 0.57, 8, frame=TRIM)
    # Clock cupola on the ridge.
    box(0.65, 1.75, 0.5, 0.5, 23, 5, TRIM)
    box(0.78, 2.25, 0.24, 0.012, 24, 3.2, mat("#f6f2e4", 0.5, grain=0))
    box(0.79, 2.262, 0.22, 0.008, 25.4, 0.4, mat(DARKC, 0.5, grain=0))
    box(0.66, 1.76, 0.48, 0.48, 23.0, 0.6, mat(team, 0.5, grain=0))
    box(0.6, 1.7, 0.6, 0.6, 28, 0.8, TRIM)
    roof(0.6, 1.7, 0.6, 0.6, 28.8, 5, mat("#3f6b5c", 0.5, metal=0.4, grain=0.1), kind="pyramid", overhang=0.0)
    rod((0.9, 2.0, zp(33.8)), (0.9, 2.0, zp(39)), 0.01, mat("#d8c070", 0.3, metal=0.9, grain=0))


DARKC = "#222222"


def russia(team):
    CON = mat("#8e9196", 0.9, grain=0.12, scale=14)
    LIGHT = mat("#b0b3b8", 0.8, grain=0.06)
    box(0, 0.3, 1.8, 3.4, 2, 9, CON)
    facade(0, 0.3, 1.8, 3.4, 2, 9, 6, 11, 2, LIGHT, fill=0.6)
    flat_roof(0, 0.3, 1.8, 3.4, 11)
    parapet(0, 0.3, 1.8, 3.4, 11, 1, LIGHT, 0.04)
    door("left", 0, 0.3, 1.8, 3.4, 2, 0.15, 0.3, 5, frame=LIGHT)
    box(0.15, 0.4, 1.3, 2.0, 11, 13, mat("#878a8f", 0.9, grain=0.12, scale=14))
    facade(0.15, 0.4, 1.3, 2.0, 11, 13, 4, 6, 3, LIGHT, fill=0.62)
    flat_roof(0.15, 0.4, 1.3, 2.0, 24)
    parapet(0.15, 0.4, 1.3, 2.0, 24, 1.5, LIGHT, 0.05)
    # Red banner down the front of the block.
    box(0.62, 2.4, 0.36, 0.015, 12, 11, mat(team, 0.7, grain=0.05))
    # Round glass corner tower with floor rings.
    lathe(1.3, 2.9, 11, [(0.42, 0), (0.42, 20)], mat("#4d6478", 0.08, metal=0.2, grain=0, glass=True), segs=48, cap_top=True)
    for k in range(6):
        lathe(1.3, 2.9, 11 + k * 4, [(0.43, 0), (0.43, 0.6)], LIGHT, segs=48)
    box(0.9, 2.5, 0.8, 0.8, 31, 1, CON)
    rod((1.3, 2.9, zp(32)), (1.3, 2.9, zp(44)), 0.012, mat("#9a9a9a", 0.4, metal=0.8, grain=0))
    for du, dv in ((0.3, 0.6), (0.9, 0.9)):
        box(du, dv, 0.2, 0.15, 24, 2, mat("#9ea1a5", 0.6, metal=0.4))


def china(team):
    WALL = mat("#a8342c", 0.75, grain=0.1)
    TILE = mat("#4a4e52", 0.75, grain=0.25, scale=60)
    GOLDT = mat("#d8b04a", 0.4, metal=0.6, grain=0)
    TERR = mat("#cfcac0", 0.85, grain=0.12)
    box(0, 0.3, 1.8, 3.4, 2, 2, TERR)
    box(0.05, 0.35, 1.7, 3.3, 4, 0.6, mat("#e2ddd2", 0.8))
    box(0.25, 0.6, 1.3, 2.3, 4.6, 10, WALL)
    columns_u(0.27, 1.53, 2.92, 6, 4.6, 10, 0.03, mat("#7a1d14", 0.6))
    for k in range(5):
        box(0.37 + k * 0.24, 2.9, 0.14, 0.01, 6.5, 5.5, mat("#3a1a12", 0.6, grain=0))
        box(0.37 + k * 0.24 - 0.01, 2.9, 0.16, 0.012, 12, 0.8, GOLDT)
    windows("right", 0.25, 0.6, 1.3, 2.3, 4.6, 10, 6, 1, mat("#3a1a12", 0.6, grain=0), GOLDT)
    box(0.24, 0.59, 1.32, 2.32, 13.6, 1, GOLDT)
    roof(0.1, 0.45, 1.6, 2.6, 14.6, 5, TILE, overhang=0.06)
    box(0.35, 0.8, 1.1, 1.9, 17, 7, WALL)
    box(0.34, 0.79, 1.12, 1.92, 23, 1, GOLDT)
    roof(0.25, 0.7, 1.3, 2.1, 24, 8, TILE, overhang=0.06)
    # Team plaque over the door.
    box(0.82, 2.91, 0.16, 0.012, 9, 2.5, mat(team, 0.5, grain=0))
    steps(0.7, 3.65, 0.4, 2, 2, 0.06, 1.3, TERR)
    # Small gate in front.
    box(0.5, 3.2, 0.8, 0.35, 2, 5, WALL)
    box(0.7, 3.55, 0.4, 0.012, 2, 4, mat("#3a2018", 0.6, grain=0))
    roof(0.45, 3.15, 0.9, 0.45, 7, 2.5, TILE, overhang=0.08)


def europe(team):
    STONE = mat("#cdc6b4", 0.85, grain=0.12)
    LIGHT = mat("#e6e0d0", 0.75, grain=0.06)
    DARKS = mat("#b7af9c", 0.85, grain=0.12)
    box(0, 0.3, 1.8, 3.1, 2, 13, STONE)
    facade(0, 0.3, 1.8, 3.1, 2, 13, 6, 10, 3, LIGHT, fill=0.45)
    cornice(0, 0.3, 1.8, 3.1, 15, 0.8, LIGHT)
    flat_roof(0, 0.3, 1.8, 3.1, 15.8)
    parapet(0, 0.3, 1.8, 3.1, 15.8, 1.6, DARKS, 0.06)
    for du, v in ((0, 0.3), (1.35, 0.3), (0, 2.95), (1.35, 2.95)):
        box(du - 0.02, v - 0.02, 0.49, 0.49, 2, 17, DARKS)
        roof(du - 0.02, v - 0.02, 0.49, 0.49, 19, 4, mat("#5a6670", 0.6, metal=0.4), kind="pyramid", overhang=0.02)
    # Glass rotunda.
    cylinder(0.9, 1.8, 0.6, 15.8, 4, DARKS, segs=48)
    lathe(0.9, 1.8, 19.8, [(0.58 * math.cos(t * math.pi / 2 / 10), 13 * math.sin(t * math.pi / 2 / 10)) for t in range(11)],
          mat("#6f8ea6", 0.05, metal=0.3, grain=0, glass=True), segs=48, cap_bottom=True)
    for k in range(12):
        a = 2 * math.pi * k / 12
        prof = [(0.59 * math.cos(t * math.pi / 2 / 10), 19.8 + 13 * math.sin(t * math.pi / 2 / 10)) for t in range(11)]
        for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
            rod((0.9 + r0 * math.cos(a), 1.8 + r0 * math.sin(a), zp(z0)), (0.9 + r1 * math.cos(a), 1.8 + r1 * math.sin(a), zp(z1)), 0.008, LIGHT, 4)
    rod((0.9, 1.8, zp(32.8)), (0.9, 1.8, zp(37)), 0.01, mat("#d0d0d0", 0.4, metal=0.8, grain=0))
    # Portico.
    box(0.25, 3.4, 1.3, 0.3, 2, 1, LIGHT)
    columns_u(0.32, 1.48, 3.6, 5, 3, 8, 0.035, mat("#f2eee4", 0.7), LIGHT)
    box(0.25, 3.4, 1.3, 0.3, 11, 1.5, STONE)
    box(0.25, 3.7, 1.3, 0.01, 11.3, 0.9, mat(team, 0.5, grain=0))
    pediment_z = 12.5
    roof(0.25, 3.4, 1.3, 0.3, pediment_z, 3, LIGHT, kind="gable", ridge="v", overhang=0.02)
    door("left", 0, 0.3, 1.8, 3.1, 2, 0.45, 0.55, 6, frame=LIGHT)
    steps(0.35, 3.7, 1.1, 2, 1, 0.06, 1, LIGHT)


def islamic(team):
    SAND = mat("#d2b68a", 0.85, grain=0.12)
    LIGHT = mat("#e6d6b6", 0.8, grain=0.08)
    TEAM_T = mat(team, 0.35, grain=0.05)
    TILE = mat("#2a6b8a", 0.35, grain=0.05)
    GOLDM = mat(GOLD, 0.3, metal=0.9, grain=0)
    box(0, 0.4, 1.7, 3.0, 2, 11, SAND)
    windows("left", 0, 0.4, 1.7, 3.0, 2, 11, 5, 2, mat("#2a221a", 0.6, grain=0), LIGHT, fill=0.4)
    windows("right", 0, 0.4, 1.7, 3.0, 2, 11, 8, 2, mat("#2a221a", 0.6, grain=0), LIGHT, fill=0.4)
    box(-0.01, 0.39, 1.72, 3.02, 11, 1, TILE)
    flat_roof(0, 0.4, 1.7, 3.0, 13)
    parapet(0, 0.4, 1.7, 3.0, 12, 1.4, mat("#c6a87a", 0.85), 0.05)
    # Iwan portal.
    box(0.35, 3.2, 1.0, 0.3, 2, 16, LIGHT)
    box(0.43, 3.5, 0.84, 0.01, 2, 13.5, TILE)
    box(0.6, 3.25, 0.5, 0.26, 2, 11, mat("#3a2e22", 0.8, grain=0.05))
    box(0.43, 3.5, 0.84, 0.012, 14.3, 1.4, TEAM_T)
    cornice(0.35, 3.2, 1.0, 0.3, 18, 0.8, SAND, 0.02)
    # Domes.
    for vv in (1.0, 2.6):
        cylinder(0.45, vv, 0.26, 13, 1, LIGHT, segs=32)
        dome(0.45, vv, 0.28, 14, 4, mat("#e8dcc4", 0.7), segs=32)
    cylinder(0.9, 1.8, 0.45, 13, 2.5, LIGHT, segs=48)
    cylinder(0.9, 1.8, 0.47, 15.5, 0.6, TILE, segs=48)
    lathe(0.9, 1.8, 16, [(0.47, 0), (0.5, 3), (0.42, 7), (0.2, 10), (0.0005, 11)], TEAM_T, segs=48)
    rod((0.9, 1.8, zp(27)), (0.9, 1.8, zp(31)), 0.01, GOLDM)
    minaret(1.55, 0.55, 2, 40, 0.16, LIGHT, TEAM_T, GOLDM)


HALLS = {"usa": usa, "russia": russia, "china": china, "europe": europe, "islamic": islamic}


def hall(f):
    HALLS[f](TEAM[f])
    render(f"parallelgov-hall-{f}", (2, 4), HEIGHT[f] + 2)


def base():
    box(0, 0, 4, 5, 0, 2, mat("#9a968c", 0.95, grain=0.18, scale=6))
    # Forecourt paving slabs and a central path in front.
    for k in range(9):
        box(0.15 + k * 0.42, 3.85, 0.4, 1.0, 2, 0.15, mat("#b4afa4" if k % 2 else "#aaa59a", 0.9, grain=0.15, scale=10))
    box(1.85, 3.7, 0.3, 1.25, 2, 0.2, mat("#c9c3b6", 0.85))
    render("parallelgov-base", (4, 5), 4)


MODELS = {f"parallelgov-hall-{f}": (lambda f=f: hall(f)) for f in TEAM}
MODELS["parallelgov-base"] = base

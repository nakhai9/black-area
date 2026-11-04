"""Flagpole (1 x 1, a flat piece: height scale 1): each nation's flag plaza. The pole and the waving flag are drawn in
code on top (drawNationalPole / drawFlagOnPole), so only the podium is rendered."""


import kit
from kit import box, cylinder, dome, mat, render, rod, zp, TEAM


def step(inset, z, h, m):
    box(inset, inset, 1 - 2 * inset, 1 - 2 * inset, z, h, m)


def lamp(u, v, z, glow):
    post = mat("#3b3f44", 0.5, metal=0.6, grain=0)
    rod((u, v, zp(z)), (u, v, zp(z + 7)), 0.012, post)
    dome(u, v, 0.03, z + 6.6, 1.4, mat(glow, 0.3, grain=0, emit=glow), segs=16)


def usa():
    step(0, 0, 2, mat("#9c9a90", 0.9, grain=0.15))
    step(0.18, 2, 1.6, mat("#b2aea2", 0.85, grain=0.12))
    step(0.28, 3.6, 1.6, mat("#bfbbae", 0.85, grain=0.12))
    step(0.36, 5.2, 1.6, mat("#cbc6b8", 0.8, grain=0.1))
    box(0.4, 0.82, 0.2, 0.01, 2.3, 1.1, mat("#8a6a3a", 0.4, metal=0.8, grain=0))
    lamp(0.12, 0.88, 2, "#fff2c0")
    lamp(0.88, 0.12, 2, "#fff2c0")


def russia():
    step(0, 0, 2, mat("#77706a", 0.9, grain=0.15))
    step(0.22, 2, 2.4, mat("#7d2a22", 0.5, grain=0.12))
    step(0.3, 4.4, 2.4, mat("#8f3329", 0.45, grain=0.12))
    iron = mat("#2f2b28", 0.6, metal=0.5, grain=0)
    cylinder(0.84, 0.84, 0.1, 2, 1.4, iron, segs=24)
    cylinder(0.84, 0.84, 0.07, 3.4, 0.05, mat("#ff9a30", 0.5, grain=0, emit="#ff7a20"), segs=24)
    for u, v in ((0.1, 0.92), (0.5, 0.94), (0.94, 0.5), (0.92, 0.1)):
        box(u - 0.025, v - 0.025, 0.05, 0.05, 2, 3, iron)


def china():
    marble = mat("#d6d0c2", 0.7, grain=0.08)
    step(0, 0, 2, mat("#cfcabd", 0.8, grain=0.12))
    step(0.08, 2, 2.4, marble)
    rail = mat("#e2dccf", 0.7, grain=0.05)
    for i in range(7):
        t = 0.1 + i * 0.135
        box(t - 0.02, 0.88, 0.04, 0.04, 4.4, 2.2, rail)
        box(0.88, t - 0.02, 0.04, 0.04, 4.4, 2.2, rail)
    box(0.08, 0.88, 0.84, 0.04, 6.6, 0.6, rail)
    box(0.88, 0.08, 0.04, 0.84, 6.6, 0.6, rail)
    step(0.3, 4.4, 2, mat("#dcd6c8", 0.7, grain=0.06))
    wood = mat("#5a2a1a", 0.7, grain=0)
    red = mat("#d42a1e", 0.5, grain=0, emit="#a01810")
    for u, v in ((0.2, 0.8), (0.8, 0.2)):
        rod((u, v, zp(4.4)), (u, v, zp(12.4)), 0.012, wood)
        cylinder(u, v, 0.05, 9.4, 2.4, red, segs=16)


def europe():
    step(0, 0, 2, mat("#aeb4ba", 0.6, metal=0.4, grain=0.05))
    cylinder(0.5, 0.5, 0.4, 2, 2, mat("#3c4f78", 0.1, grain=0, glass=True), segs=48)
    cylinder(0.5, 0.5, 0.3, 4, 1.5, mat("#50669a", 0.1, grain=0, glass=True), segs=48)


def islamic():
    sand = mat("#cdb994", 0.85, grain=0.12)
    step(0, 0, 2, mat("#c4b08a", 0.9, grain=0.15))
    step(0.12, 2, 2, mat(TEAM["islamic"], 0.35, grain=0.05))
    step(0.3, 4, 2, sand)


PLAZAS = {"usa": usa, "russia": russia, "china": china, "europe": europe, "islamic": islamic}


def flagpole(f):
    kit.ZS = 1.0
    try:
        PLAZAS[f]()
        render(f"flagpole-{f}", (1, 1), 14)
    finally:
        kit.ZS = 1.35


MODELS = {f"flagpole-{f}": (lambda f=f: flagpole(f)) for f in TEAM}

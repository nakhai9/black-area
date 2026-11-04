"""Pyramids of Giza (6 x 6 monument, flat piece: height scale 1.0): Khufu, Khafre with its casing cap, Menkaure,
three queens' pyramids and the Sphinx, on drifted sand with no plot of its own."""
import random

import kit
from kit import box, lathe, mat, prism, render, roof, zp

# [u, v, side, height, kind]: 0 plain, 1 Khafre's casing cap, 2 Khufu's flat summit (as in Pyramids.ts).
PYRAMIDS = [
    (3.5, 0.2, 2.4, 80, 2),
    (0.9, 1.5, 2.2, 74, 1),
    (0.35, 4.3, 1.2, 36, 0),
    (1.9, 4.15, 0.45, 12, 0),
    (1.9, 4.75, 0.45, 12, 0),
    (1.9, 5.35, 0.45, 12, 0),
]


def stepped(u, v, w, h, kind, rnd):
    stone = [mat(c, 0.95, grain=0.28, scale=s) for c, s in (("#c9a86c", 40), ("#c2a064", 55), ("#cfb077", 35))]
    courses = max(6, round(h / 1.6))
    cap = 0.18 if kind == 1 else 0
    flat = 0.05 if kind == 2 else 0
    top_t = 1 - (cap or flat)
    ch = h / courses
    for i in range(courses):
        t = i / courses
        if t >= top_t:
            break
        inset = w / 2 * t
        box(u + inset, v + inset, w - 2 * inset, w - 2 * inset, i * ch, ch * 0.98, stone[rnd.randrange(3)])
        # Missing blocks: dark notches on the two visible faces.
        if w > 1 and rnd.random() < 0.35:
            s = rnd.uniform(0.15, 0.8) * (w - 2 * inset)
            dark = mat("#7d6338", 0.95, grain=0.2)
            if rnd.random() < 0.5:
                box(u + inset + s, v + w - inset - 0.01, 0.06, 0.02, i * ch, ch * 0.9, dark)
            else:
                box(u + w - inset - 0.01, v + inset + s, 0.02, 0.06, i * ch, ch * 0.9, dark)
    if cap:
        t0 = 1 - cap
        inset = w / 2 * t0
        roof(u + inset, v + inset, w - 2 * inset, w - 2 * inset, h * t0, h * cap, mat("#e8dcba", 0.8, grain=0.12, scale=30), kind="pyramid", overhang=0.0)


def drift(u, v, w):
    k = max(0.12, w * 0.07)
    sand = mat("#d8b673", 1.0, grain=0.12, scale=6)
    prism([(u - k, v - k), (u + w + k, v - k), (u + w + k, v + w + k), (u - k, v + w + k)], 0, 0.6, sand)


def sphinx(u, v):
    S = mat("#c4a062", 0.95, grain=0.3, scale=45)
    pit = mat("#b48f55", 1.0, grain=0.2, scale=10)
    prism([(u - 0.2, v - 0.15), (u + 1.6, v - 0.15), (u + 1.6, v + 0.65), (u - 0.2, v + 0.65)], 0, 0.4, pit)
    # Lion body with its higher haunch, forepaws stretched forward (+u).
    box(u, v + 0.06, 0.95, 0.38, 0, 4.5, S, bevel=0.02)
    box(u - 0.05, v + 0.03, 0.35, 0.44, 0, 6, S, bevel=0.03)
    box(u + 0.95, v + 0.05, 0.47, 0.12, 0, 2, S, bevel=0.015)
    box(u + 0.95, v + 0.33, 0.47, 0.12, 0, 2, S, bevel=0.015)
    # Chest, nemes headdress lappets and head.
    box(u + 0.72, v + 0.1, 0.26, 0.3, 4, 4, S, bevel=0.02)
    box(u + 0.74, v + 0.07, 0.2, 0.36, 7, 5, mat("#b89454", 0.95, grain=0.3, scale=45), bevel=0.02)
    box(u + 0.8, v + 0.13, 0.22, 0.24, 8, 5, S, bevel=0.03)
    lathe(u + 0.85, v + 0.25, 12.8, [(0.13, 0), (0.08, 1.2), (0.001, 1.5)], S, 24, cap_bottom=True)
    # Headdress stripes on the face towards the viewer.
    for k in range(3):
        box(u + 0.94, v + 0.07, 0.005, 0.36, 7.6 + k * 1.4, 0.4, mat("#8f7040", 0.95, grain=0.2))


def pyramids():
    kit.ZS = 1.0
    try:
        rnd = random.Random(7)
        for u, v, w, h, _ in PYRAMIDS:
            drift(u, v, w)
        for u, v, w, h, kind in PYRAMIDS:
            stepped(u, v, w, h, kind, rnd)
        sphinx(4.1, 4.5)
        render("pyramids", (6, 6), 84)
    finally:
        kit.ZS = 1.35


MODELS = {"pyramids": pyramids}

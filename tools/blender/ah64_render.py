"""
AH-64E Apache Guardian (USA attack helicopter): self-contained Blender model + body sprite sheet (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/ah64_render.py -- [SAMPLES] [--preview]

The main rotor is NOT in this sheet: it is a separate, reusable sheet (tools/blender/rotor_render.py ->
rotor-ah64.png) that the game draws on top of the body, spinning in flight and standing still on the ground.
The mast sits exactly at u = 0, so the rotor hub is straight above the cell centre for every facing.

Writes ui/public/sprites/heli-ah64-usa.png (then `python tools/to_webp.py`): 192 px cells, 32 RA2 facings x 7 rows
  0 parked (tail rotor still)     1-2 flying (tail rotor blurred, two phases)
  3 crashing (pitched, dark)      4 wreck (burnt)
  5 cap: mast-top Longbow radar only, drawn after the main rotor
  6 shadow (body flattened, flat black; the game sets its opacity)

Real numbers (AH-64E): length 17.73 m rotors turning, fuselage ~15.5 m (+ nose sensors and tail), main rotor 14.63 m
(4 blades), tail rotor 2.79 m (4 blades, scissor 55/125 deg, on the LEFT of the fin), height to rotor hub 3.87 m,
4.95 m to the top of the Longbow radome, stub wing span 5.23 m, main wheel track ~2.0 m.
Drawn: all true scale, fuselage slightly fuller (cheeks 1.1x) so it reads at sprite size. Axes: u nose, v left, z up,
metres, ground at z = 0. Side-on fuselage length LENGTH spans 0.74 of a cell (same rule as airkit.run).
Paint: US Army dark grey-black (FS 34031-ish darkened, per the refs); glazing as real faceted panes with frames;
TEAM blue band round the tail boom.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from airkit import (CELL, DIRS, PARTS, PREVIEW, SIN_E, SPRITES, TEAM, grab, lathe, loft, mat, obj, plate, pose, rod,  # noqa: E402
                    shadow_material, show, srgb, stage, superellipse, surface, box)

LENGTH = 17.4           # nose sensor tip (u 7.27) to fin-top trailing edge (u -10.15)
SCALE = CELL * 0.74 / LENGTH   # sheet px per metre (rotor_render.py must use the same: --length 17.4)
HUB_Z = 4.25            # rotor hub height above ground (rotor sheet is centred on the hub)
TR = (-9.75, 0.40, 4.0)  # tail rotor centre (left side of the fin)
TR_R = 1.40

SKIN = '#34393c'
DARK = '#25292b'


def blur_mat(name, hexc, alpha):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexc)
    b.inputs['Roughness'].default_value = 0.6
    b.inputs['Alpha'].default_value = alpha
    return m


def materials():
    return dict(
        skin=mat('skin', SKIN, 0.62, panels=True),
        dark=mat('dark', DARK, 0.7),
        frame=mat('frame', '#1b1e20', 0.55, ao=0.1),
        glass=mat('glass', '#3d5568', 0.06, glass=True, ao=0),
        sensor=mat('sensor', '#1c2c38', 0.05, glass=True, ao=0),
        intake=mat('intake', '#0d0e0f', 0.9, ao=0.6),
        hot=mat('hot', '#4d4740', 0.45, metal=0.7),
        metal=mat('metal', '#7c7f81', 0.38, metal=0.85, ao=0.3),
        tyre=mat('tyre', '#18191a', 0.85),
        strut=mat('strut', '#9da1a4', 0.35, metal=0.8, ao=0.2),
        missile=mat('missile', '#454b3d', 0.6),
        pod=mat('pod', '#3a3e37', 0.6),
        team=mat('team', TEAM['usa'], 0.5, ao=0),
        navred=mat('navred', '#ff2a2a', 0.4, emit=5.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=5.0, ao=0),
        blade=mat('tblade', '#2a2d2f', 0.55),
        disc=blur_mat('tdisc', '#3a3e41', 0.28),
        ghost=blur_mat('tghost', '#2a2d2f', 0.5),
    )


# ------------------------------------------------------------------------------------------------ fuselage

# (u, axis height zc, half width, half height); superellipse n = 3.2 (flat sides, rounded corners)
STATIONS = [
    (6.55, 1.40, 0.22, 0.34), (6.35, 1.42, 0.43, 0.60), (5.90, 1.45, 0.52, 0.76), (5.00, 1.50, 0.56, 0.84),
    (3.50, 1.58, 0.60, 0.95), (2.00, 1.68, 0.65, 1.08), (0.50, 1.76, 0.67, 1.14), (-1.50, 1.86, 0.65, 1.08),
    (-2.80, 1.98, 0.52, 0.80), (-4.00, 2.04, 0.40, 0.55), (-6.50, 2.06, 0.30, 0.40), (-8.60, 2.06, 0.24, 0.32),
    (-9.20, 2.06, 0.22, 0.30), (-9.45, 2.06, 0.06, 0.10),
]
N = 3.2


def station(u):
    s = STATIONS
    if u >= s[0][0]:
        return s[0][1:]
    for (u0, *a), (u1, *b) in zip(s, s[1:]):
        if u1 <= u <= u0:
            f = (u0 - u) / (u0 - u1)
            return tuple(x + (y - x) * f for x, y in zip(a, b))
    return s[-1][1:]


def top(u):
    zc, _, hh = station(u)
    return zc + hh


def fuselage(M):
    us = sorted({round(x, 3) for x in list(np.linspace(6.55, 5.0, 8)) + list(np.linspace(5.0, -2.8, 14)) + list(np.linspace(-2.8, -9.45, 14))}, reverse=True)
    loft('fuselage', [superellipse(u, 0, *(lambda zc, hw, hh: (zc, hw, hh))(*station(u)), N, 44) for u in us], M['skin'])
    # Avionics cheeks (the long side bays), flat topped, merging into the fuselage.
    for s in (1, -1):
        loft(f'cheek{s}', [superellipse(u, s * 0.76, 1.2, w, h, 4.0, 28) for u, w, h in
                           ((5.95, 0.06, 0.08), (5.55, 0.32, 0.38), (4.8, 0.4, 0.45), (-0.6, 0.4, 0.45), (-1.4, 0.32, 0.36), (-1.9, 0.06, 0.08))], M['skin'], smooth=35)
        # Access-panel seams and a step on each cheek.
        for u in (3.6, 1.8, 0.2):
            box(f'cheek_seam{s}{u}', (u, s * 1.16, 1.2), (0.03, 0.01, 0.7), M['dark'])
        box(f'step{s}', (4.2, s * 1.17, 0.86), (0.35, 0.05, 0.05), M['strut'])
    # Rear deck / doghouse behind the cockpit carrying the mast and the engines.
    loft('deck', [superellipse(u, 0, zc, w, h, 3.0, 36) for u, zc, w, h in
                  ((2.05, 2.7, 0.2, 0.12), (1.6, 2.86, 0.5, 0.36), (0.0, 2.92, 0.56, 0.38), (-2.2, 2.86, 0.5, 0.32), (-3.1, 2.62, 0.2, 0.1))], M['skin'])
    # Mast fairing and mast (the hub and blades are the separate rotor sheet).
    loft('mast_fairing', [superellipse(0, 0, z, r, r, 2.0, 28, axis='z') for z, r in
                          ((3.2, 0.42), (3.35, 0.38), (3.55, 0.26), (3.75, 0.17))], M['skin'])
    rod('mast', (0, 0, 3.7), (0, 0, HUB_Z - 0.1), 0.12, M['metal'])
    # Team band round the tail boom.
    loft('team_band', [superellipse(u, 0, station(u)[0], station(u)[1] + 0.012, station(u)[2] + 0.012, N, 44) for u in (-5.4, -5.75)], M['team'], cap=False)


def ring(u, zt, ht):
    zc, hw, hh = station(u)
    zs, hb = zc + hh - 0.07, hw - 0.03
    zm, hm = zs + (zt - zs) * 0.42, hb * 0.93
    return [(u, -hb, zs), (u, -hm, zm), (u, -ht, zt), (u, ht, zt), (u, hm, zm), (u, hb, zs)]


CANOPY = [(6.30, None, 0.13), (6.05, 2.70, 0.24), (5.75, 2.95, 0.29), (4.70, 3.12, 0.31), (4.62, 3.14, 0.31),
          (4.50, 3.42, 0.32), (3.00, 3.47, 0.32), (2.30, 3.30, 0.29), (1.85, None, 0.22)]
FRAMES = (6.05, 5.75, 4.66, 4.50, 3.75, 3.00, 2.30)


def canopy(M):
    """Tandem cockpits: real faceted panes (gunner in front, pilot raised behind) with their frames."""
    prof = [(u, zt if zt is not None else top(u) + 0.05, ht) for u, zt, ht in CANOPY]
    rings = [ring(*p) for p in prof]
    loft('canopy', rings, M['glass'], smooth=0)
    zt_at = lambda u: np.interp(-u, [-p[0] for p in prof], [p[1] for p in prof])
    ht_at = lambda u: np.interp(-u, [-p[0] for p in prof], [p[2] for p in prof])
    for u in FRAMES:
        r = ring(u, zt_at(u), ht_at(u))
        r = [(x + 0.0, y * 1.02, z + 0.01) for x, y, z in r]
        w = 0.05 if u in (4.66, 4.50) else 0.032
        for a, b in zip(r, r[1:]):
            rod(f'frame{u}{a[1]:.2f}', a, b, w, M['frame'], segs=6)
    for idx in (1, 2, 3, 4):
        pts = [ring(u, zt_at(u), ht_at(u))[idx] for u in np.linspace(6.05, 2.3, 12)]
        pts = [(x, y * 1.02, z + 0.01) for x, y, z in pts]
        for a, b in zip(pts, pts[1:]):
            rod(f'rail{idx}{a[0]:.2f}', a, b, 0.03, M['frame'], segs=6)
    # Blast shield between the two cockpits, seat headrests seen through the glass.
    box('blast_shield', (4.58, 0, 2.85), (0.12, 0.66, 1.0), M['frame'])
    for u, z in ((5.0, 2.8), (3.4, 3.1)):
        box(f'seat{u}', (u, 0, z), (0.18, 0.42, 0.4), M['dark'])
    # Sills under the glass.
    for s in (1, -1):
        pts = [ring(u, zt_at(u), ht_at(u))[0 if s < 0 else 5] for u in np.linspace(6.2, 1.9, 10)]
        for a, b in zip(pts, pts[1:]):
            rod(f'sill{s}{a[0]:.2f}', a, b, 0.04, M['frame'], segs=6)


def nose(M):
    """TADS (twin sensor drums) under PNVS (small turret on top), the M230 chain gun under the chin."""
    loft('nose_fairing', [superellipse(u, 0, z, w, h, 3.0, 32) for u, z, w, h in
                          ((6.45, 1.4, 0.38, 0.52), (6.75, 1.32, 0.31, 0.4), (6.85, 1.3, 0.18, 0.22))], M['skin'])
    box('tads_core', (6.85, 0, 1.15), (0.42, 0.42, 0.5), M['dark'])
    for s in (1, -1):
        lathe(f'tads_drum{s}', [(0.0, 0.0), (0.005, 0.32), (0.04, 0.35), (0.30, 0.35), (0.335, 0.31), (0.34, 0.0)],
              (6.92, s * 0.2 if s > 0 else -0.54, 1.15), 'v', M['dark'], segs=36)
        box(f'tads_window{s}', (7.27, s * 0.37, 1.17), (0.02, 0.2, 0.22), M['sensor'])
        box(f'tads_window_b{s}', (7.24, s * 0.37, 0.93), (0.02, 0.12, 0.08), M['sensor'])
    loft('pnvs', [superellipse(6.7, 0, z, r, r, 2.0, 28, axis='z') for z, r in
                  ((1.74, 0.05), (1.76, 0.19), (1.86, 0.24), (1.98, 0.23), (2.07, 0.15), (2.1, 0.03))], M['dark'])
    box('pnvs_window', (6.93, 0, 1.92), (0.02, 0.18, 0.12), M['sensor'])
    # Chain gun turret and barrel.
    loft('gun_turret', [superellipse(4.4, 0, z, r, r, 2.0, 24, axis='z') for z, r in
                        ((0.64, 0.24), (0.55, 0.26), (0.44, 0.2), (0.38, 0.06))], M['dark'])
    rod('gun_body', (4.45, 0, 0.44), (5.1, 0, 0.42), 0.075, M['dark'])
    rod('gun_barrel', (5.1, 0, 0.42), (6.15, 0, 0.40), 0.04, M['metal'])
    rod('gun_muzzle', (6.05, 0, 0.40), (6.2, 0, 0.40), 0.055, M['dark'])


def engines(M):
    for s in (1, -1):
        v = s * 1.05
        loft(f'nacelle{s}', [superellipse(u, v, 2.7, w, h, 2.8, 36) for u, w, h in
                             ((0.55, 0.15, 0.15), (0.45, 0.4, 0.42), (0.1, 0.46, 0.48), (-2.4, 0.46, 0.48),
                              (-2.95, 0.4, 0.4), (-3.15, 0.3, 0.3))], M['skin'])
        plate(f'intake{s}', [(0.47, v + 0.33 * math.cos(t), 2.7 + 0.35 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 24, endpoint=False)],
              (1, 0, 0), M['intake'], off=0.0)
        lathe(f'spinner{s}', [(0, 0.0), (0.06, 0.08), (0.14, 0.1)], (0.52, v, 2.7), 'u', M['metal'], segs=16)
        box(f'pylon{s}', (-1.1, s * 0.66, 2.62), (2.5, 0.55, 0.4), M['skin'])
        for u in (-0.6, -1.5):
            box(f'nacelle_seam{s}{u}', (u, v + s * 0.44, 2.7), (0.03, 0.03, 0.66), M['dark'])
        # "Black Hole" IR suppressor: a box turned out and down, dark mouth outboard.
        box(f'exhaust{s}', (-3.25, s * 1.28, 2.6), (0.6, 0.45, 0.38), M['hot'], rot=(0, 0, s * 0.35))
        box(f'exhaust_mouth{s}', (-3.36, s * 1.52, 2.56), (0.34, 0.03, 0.24), M['intake'], rot=(0, 0, s * 0.35))
    # APU exhaust and the small radar warning / antenna fits on the deck.
    box('apu', (-2.4, 0, 3.28), (0.6, 0.3, 0.18), M['dark'])
    rod('antenna', (-1.6, 0, 3.28), (-1.9, 0, 3.7), 0.015, M['dark'])


def wings(M):
    for s in (1, -1):
        surface(f'wing{s}', [((0.25, s * 0.6, 2.1), (-1.05, 0, 0), (0, 0, 1), 0.15),
                             ((0.08, s * 2.6, 1.98), (-0.85, 0, 0), (0, 0, 1), 0.12)], M['skin'], camber=0.0)
        box(f'wingtip{s}', (-0.3, s * 2.63, 1.99), (0.9, 0.08, 0.14), M['dark'])
        box(f'navlight{s}', (0.12, s * 2.65, 2.0), (0.08, 0.05, 0.05), M['navred'] if s > 0 else M['navgreen'])
        # Inner pylon: 19-shot Hydra rocket pod.
        box(f'pylon_in{s}', (-0.35, s * 1.3, 1.82), (0.65, 0.1, 0.36), M['dark'])
        lathe(f'hydra{s}', [(0, 0.0), (0.01, 0.24), (0.06, 0.27), (1.62, 0.27), (1.72, 0.2), (1.74, 0.0)],
              (0.55, s * 1.3, 1.38), 'u', M['pod'], segs=32)
        plate(f'hydra_face{s}', [(0.56, s * 1.3 + 0.21 * math.cos(t), 1.38 + 0.21 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 20, endpoint=False)],
              (1, 0, 0), M['intake'], off=0.0)
        # Outer pylon: four Hellfires on an M299 launcher, two above two below.
        box(f'pylon_out{s}', (-0.35, s * 2.15, 1.82), (0.65, 0.1, 0.32), M['dark'])
        box(f'launcher{s}', (-0.3, s * 2.15, 1.52), (1.45, 0.34, 0.12), M['dark'])
        for dv in (-0.12, 0.12):
            for z in (1.37, 1.15):
                lathe(f'hellfire{s}{dv}{z}', [(0, 0.0), (0.05, 0.06), (0.14, 0.085), (1.48, 0.088), (1.58, 0.07), (1.6, 0.0)],
                      (0.62, s * 2.15 + dv, z), 'u', M['missile'], segs=16)
                lathe(f'seeker{s}{dv}{z}', [(0, 0.0), (0.04, 0.05), (0.06, 0.06)], (0.64, s * 2.15 + dv, z), 'u', M['sensor'], segs=12)


def gear(M):
    for s in (1, -1):
        c = (3.0, s * 1.12, 0.38)
        lathe(f'wheel{s}', [(0, 0.0), (0.0, 0.3), (0.02, 0.37), (0.16, 0.37), (0.18, 0.3), (0.18, 0.0)],
              (c[0], c[1] - 0.09, c[2]), 'v', M['tyre'], segs=28)
        lathe(f'hub{s}', [(0, 0.0), (0.0, 0.17), (0.19, 0.17), (0.19, 0.0)], (c[0], c[1] - 0.095, c[2]), 'v', M['strut'], segs=18)
        rod(f'strut{s}', (3.6, s * 0.8, 0.9), (c[0], c[1] - s * 0.1, c[2]), 0.065, M['strut'])
        rod(f'drag{s}', (2.2, s * 0.76, 0.9), (c[0], c[1] - s * 0.1, c[2] + 0.05), 0.05, M['strut'])
        rod(f'shock{s}', (3.0, s * 0.76, 0.9), (c[0], c[1] - s * 0.1, c[2] + 0.08), 0.045, M['metal'])
    rod('tailwheel_strut', (-8.5, 0, 1.8), (-8.8, 0, 0.3), 0.05, M['strut'])
    lathe('tailwheel', [(0, 0.0), (0.0, 0.17), (0.02, 0.22), (0.12, 0.22), (0.14, 0.17), (0.14, 0.0)], (-8.8, -0.07, 0.22), 'v', M['tyre'], segs=20)


def tail(M):
    surface('fin', [((-8.2, 0, 2.2), (-1.4, 0, 0), (0, 1, 0), 0.14), ((-9.4, 0, 4.4), (-0.75, 0, 0), (0, 1, 0), 0.12)], M['skin'], camber=0.0)
    surface('stabilator', [((-9.25, -1.7, 2.3), (-0.72, 0, 0), (0, 0, 1), 0.1), ((-9.05, 0, 2.3), (-0.92, 0, 0), (0, 0, 1), 0.12),
                           ((-9.25, 1.7, 2.3), (-0.72, 0, 0), (0, 0, 1), 0.1)], M['skin'], camber=0.0)
    # Tail rotor gearbox and hub, on the left of the fin top.
    u, v, z = TR
    lathe('tr_gearbox', [(0, 0.0), (0.0, 0.14), (0.3, 0.16), (0.36, 0.0)], (u, 0.02, z), 'v', M['dark'], segs=18)
    lathe('tr_hub', [(0, 0.0), (0.0, 0.1), (0.1, 0.1), (0.1, 0.0)], (u, v - 0.06, z), 'v', M['metal'], segs=14)


def tr_blade(name, ang, material, group, width=0.22):
    u, v, z = TR
    d = np.array([math.cos(ang), 0, math.sin(ang)])
    p = np.array([-math.sin(ang), 0, math.cos(ang)])
    c = np.array([u, v + 0.03, z])
    a, b = c + d * 0.12, c + d * (TR_R - 0.02)
    t = np.array([0, 0.015, 0])
    vs = [a - p * width / 2 - t, b - p * width / 2 - t, b + p * width / 2 - t, a + p * width / 2 - t,
          a - p * width / 2 + t, b - p * width / 2 + t, b + p * width / 2 + t, a + p * width / 2 + t]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return obj(name, [tuple(x) for x in vs], f, material, group, smooth=0)


def tail_rotor(M):
    scissor = (0, 55, 180, 235)
    for a in scissor:
        tr_blade(f'trs{a}', math.radians(a + 20), M['blade'], 'trs')
    u, v, z = TR
    for g, off in (('tr_a', 0), ('tr_b', 40)):
        plate(f'tdisc_{g}', [(u + TR_R * math.cos(t), v + 0.04, z + TR_R * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 36, endpoint=False)],
              (0, 1, 0), M['disc'], group=g, off=0.0)
        for a in scissor:
            tr_blade(f'trg{g}{a}', math.radians(a + off), M['ghost'], g, width=0.3)


def cap(M):
    """Longbow fire-control radar on the mast top (above the rotor hub): its own row, drawn after the rotor."""
    rod('mast_ext', (0, 0, HUB_Z + 0.15), (0, 0, HUB_Z + 0.45), 0.09, M['metal'], group='cap')
    loft('radome', [superellipse(0, 0, HUB_Z + z, r, r, 2.0, 40, axis='z') for z, r in
                    ((0.40, 0.06), (0.42, 0.38), (0.50, 0.60), (0.62, 0.70), (0.76, 0.69), (0.88, 0.58), (0.95, 0.34), (0.97, 0.05))],
         M['dark'], group='cap', smooth=60)
    loft('radome_band', [superellipse(0, 0, HUB_Z + z, 0.705, 0.705, 2.0, 40, axis='z') for z in (0.67, 0.71)], M['frame'], group='cap', cap=False)


def build():
    M = materials()
    fuselage(M)
    canopy(M)
    nose(M)
    engines(M)
    wings(M)
    gear(M)
    tail(M)
    tail_rotor(M)
    cap(M)


# Rows: (visible groups, pitch, roll, tint)
ROWS = [
    (('always', 'trs'), 0, 0, 1.0),           # 0 parked
    (('always', 'tr_a'), 0, 0, 1.0),          # 1 flying
    (('always', 'tr_b'), 0, 0, 1.0),          # 2 flying, other tail-rotor phase
    (('always', 'trs', 'cap'), -15, 20, 0.6),  # 3 crashing
    (('always', 'cap'), 0, 6, 0.35),          # 4 wreck
    (('cap',), 0, 0, 1.0),                    # 5 cap
]


def main():
    out = os.path.join(SPRITES, 'heli-ah64-preview.png' if PREVIEW else 'heli-ah64-usa.png')
    sc = stage(SCALE)
    build()
    plane = bpy.data.objects.new('plane', None)
    sc.collection.objects.link(plane)
    rig = bpy.data.objects.new('rig', None)
    sc.collection.objects.link(rig)
    plane.parent = rig
    zs = [(ob.matrix_world @ v.co).z for ob, g in PARTS if g == 'always' for v in ob.data.vertices]
    zmid = (max(zs) + min(zs)) / 2
    for ob, _ in PARTS:
        ob.parent = plane
        ob.location.z -= zmid
    tmp = os.path.join(os.environ.get('TEMP', os.path.dirname(out)), 'ah64-render.tmp.png')
    rows = [ROWS[0], ROWS[1], ROWS[5]] if PREVIEW else ROWS
    dirs = list(range(0, DIRS, 4)) if PREVIEW else list(range(DIRS))
    sheet = np.zeros((CELL * (len(rows) + (0 if PREVIEW else 1)), CELL * len(dirs), 4), np.float32)
    heading = lambda k: (0, 0, math.atan2(math.cos(k / DIRS * 2 * math.pi) / SIN_E, math.sin(k / DIRS * 2 * math.pi)))
    for r, (groups, pitch, roll, tint) in enumerate(rows):
        show(groups)
        pose(plane, pitch, roll)
        for ci, k in enumerate(dirs):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] *= tint
            sheet[r * CELL:(r + 1) * CELL, ci * CELL:(ci + 1) * CELL] = cell
            print(f'[ah64] row {r + 1}/{len(rows)} facing {k + 1}/{DIRS}', flush=True)
    if not PREVIEW:
        show(('always', 'trs', 'cap'))
        sh = shadow_material()
        for ob, _ in PARTS:
            ob.data.materials.clear()
            ob.data.materials.append(sh)
        plane.matrix_basis = Matrix.Diagonal((1, 1, 0.001, 1))
        sc.cycles.samples = 4
        sc.cycles.use_denoising = False
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
        r = len(rows)
        for k in range(DIRS):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] = 0
            sheet[r * CELL:(r + 1) * CELL, k * CELL:(k + 1) * CELL] = cell
            print(f'[ah64] shadow {k + 1}/{DIRS}', flush=True)
    os.remove(tmp)
    H, W = sheet.shape[:2]
    img = bpy.data.images.new('sheet', W, H, alpha=True)
    img.pixels.foreach_set(np.clip(sheet[::-1], 0, 1).astype(np.float32).ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    # Numbers for CraftSheets.ts (cell px at the stored 192 px cell).
    k = SCALE * math.cos(math.radians(30))
    print(f'[ah64] wrote {out} ({W}x{H}); px/m {SCALE:.4f}; zmid {zmid:.3f} m; '
          f'groundDrop {zmid * k:.2f} px; hubLift {(HUB_Z - zmid) * k:.2f} px', flush=True)


main()

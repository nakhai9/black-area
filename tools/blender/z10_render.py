"""
Z-10 (China attack helicopter): self-contained Blender model + body sprite sheet (ART_GUIDE.md).

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P tools/blender/z10_render.py -- [SAMPLES] [--preview]

The 5-blade main rotor is NOT in this sheet: it is the separate rotor sheet (tools/blender/rotor_render.py --name z10
--blades 5 --radius 6.5 --chord 0.45 --length 14.3 -> rotor-z10.png), drawn on top of the body. Mast at u = 0.

Writes ui/public/sprites/heli-z10-china.png (then `python tools/to_webp.py`): 192 px cells, 32 RA2 facings x 7 rows
  0 parked (tail rotor still)   1-2 flying (tail rotor blurred, two phases)   3 crashing (pitched, dark)
  4 wreck (burnt)               5 cap (empty)                                 6 shadow (flat black)

Z-10 shape (from the 3-views / photos, NOT an Apache or a Kamov): slim, FACETED fuselage with hard chines (flat sloped
upper sides, narrow flat top and keel); stepped TANDEM cockpit (gunner low in front, pilot raised behind) with flat
angular panes; nose sensor ball right on the nose tip; chin turret cannon with a long barrel; big cylindrical engine
pods high on the shoulders with round exhaust nozzles at the back; boxy mast fairing; short anhedral stub wings with
2 pylons each (rocket pod inboard, 4 HJ-10 ATGM outboard); tail-dragger gear (2 forward mains on trailing legs + tail
wheel); thin boom, tall swept fin with a 4-blade scissor tail rotor on its LEFT, small horizontal tailplane.

Real numbers (approx., [Unverified] public figures): length 14.15 m fuselage, main rotor 13.0 m (5 blades), height
3.85 m, stub-wing span ~4.4 m. Drawn: fuselage half widths x WIDEN (1.6) so the slim body reads at sprite size, wings moved out with it; LENGTH 14.3 m (sensor ball u 6.95 to fin trailing edge u -7.35), HUB_Z 3.6.
Axes: u nose, v left, z up, metres, ground z = 0. Side-on LENGTH spans 0.74 of a cell (same rule as airkit.run).
Paint: very dark olive-black (PLA), panel lines, light grime; TEAM yellow band round the tail boom.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from airkit import (CELL, DIRS, PARTS, PREVIEW, SIN_E, SPRITES, TEAM, box, grab, lathe, loft, mat, obj, plate, pose, rod,  # noqa: E402
                    shadow_material, show, srgb, stage, superellipse, surface)

LENGTH = 14.3
SCALE = CELL * 0.74 / LENGTH   # sheet px per metre (rotor_render.py must use the same: --length 14.3)
HUB_Z = 3.6
WIDEN = 1.6                    # fuselage half widths x1.6 so it reads at sprite size (ART_GUIDE: 1.5-1.9x, wings kept)
TR = (-7.0, 0.36, 3.35)        # tail rotor centre (left side of the fin)
TR_R = 1.25

SKIN = '#2d3328'
DARK = '#1e221b'


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
        skin=mat('skin', SKIN, 0.6, panels=True),
        dark=mat('dark', DARK, 0.7),
        frame=mat('frame', '#161914', 0.55, ao=0.1),
        glass=mat('glass', '#3e5a62', 0.06, glass=True, ao=0),
        sensor=mat('sensor', '#1c2c38', 0.05, glass=True, ao=0),
        intake=mat('intake', '#0c0d0b', 0.9, ao=0.6),
        hot=mat('hot', '#4a4540', 0.45, metal=0.7),
        metal=mat('metal', '#7c7f81', 0.38, metal=0.85, ao=0.3),
        tyre=mat('tyre', '#18191a', 0.85),
        strut=mat('strut', '#8f9496', 0.35, metal=0.8, ao=0.2),
        pod=mat('pod', '#3a4032', 0.6),
        missile=mat('missile', '#56603f', 0.6),
        team=mat('team', TEAM['china'], 0.5, ao=0),
        navred=mat('navred', '#ff2a2a', 0.4, emit=5.0, ao=0),
        navgreen=mat('navgreen', '#29ff5a', 0.4, emit=5.0, ao=0),
        blade=mat('tblade', '#262a24', 0.55),
        disc=blur_mat('tdisc', '#353a32', 0.28),
        ghost=blur_mat('tghost', '#262a24', 0.5),
    )


# ------------------------------------------------------------------------------------------------ fuselage

# (u, z keel, z chine, z top, half width keel, half width chine, half width top): faceted, hard chines.
STATIONS = [
    (6.45, 0.98, 1.22, 1.55, 0.12, 0.24, 0.12), (5.90, 0.78, 1.22, 1.92, 0.18, 0.40, 0.18),
    (4.40, 0.66, 1.28, 2.18, 0.28, 0.55, 0.24), (3.00, 0.68, 1.34, 2.38, 0.32, 0.60, 0.28),
    (1.50, 0.74, 1.40, 2.52, 0.34, 0.62, 0.34), (0.00, 0.80, 1.45, 2.58, 0.34, 0.60, 0.38),
    (-1.80, 0.95, 1.50, 2.48, 0.30, 0.50, 0.34), (-3.00, 1.30, 1.64, 2.24, 0.20, 0.36, 0.22),
    (-5.00, 1.55, 1.76, 2.06, 0.14, 0.26, 0.15), (-6.40, 1.66, 1.84, 2.08, 0.12, 0.22, 0.12),
    (-7.05, 1.72, 1.85, 2.00, 0.05, 0.10, 0.06),
]


def station(u):
    zb, zc, zt, hb, hc, ht = _station(u)
    return zb, zc, zt, hb * WIDEN, hc * WIDEN, ht * WIDEN


def _station(u):
    s = STATIONS
    if u >= s[0][0]:
        return s[0][1:]
    for (u0, *a), (u1, *b) in zip(s, s[1:]):
        if u1 <= u <= u0:
            f = (u0 - u) / (u0 - u1)
            return tuple(x + (y - x) * f for x, y in zip(a, b))
    return s[-1][1:]


def hexring(u, grow=0.0):
    zb, zc, zt, hb, hc, ht = station(u)
    g = grow
    return [(u, -hb - g, zb - g), (u, -hc - g, zc), (u, -ht - g, zt + g), (u, ht + g, zt + g), (u, hc + g, zc), (u, hb + g, zb - g)]


def side_pt(u, f, sgn, out=0.0):
    """Point a share f of the way up the upper sloped side (chine -> top edge)."""
    zb, zc, zt, hb, hc, ht = station(u)
    return (u, sgn * (hc + (ht - hc) * f + out), zc + (zt - zc) * f)


def fuselage(M):
    us = sorted({round(x, 3) for x in list(np.linspace(6.45, 3.0, 10)) + list(np.linspace(3.0, -7.05, 22))}, reverse=True)
    loft('fuselage', [hexring(u) for u in us], M['skin'], smooth=28)
    # Chine strips and access-panel seams down the flat sides.
    for s in (1, -1):
        pts = [(u, s * (station(u)[4] + 0.01), station(u)[1]) for u in np.linspace(5.9, -3.0, 14)]
        for a, b in zip(pts, pts[1:]):
            rod(f'chine{s}{a[0]:.2f}', a, b, 0.02, M['dark'], segs=6)
        for u in (2.4, 1.0, -0.6, -1.9):
            p0, p1 = side_pt(u, 0.15, s, 0.015), side_pt(u, 0.85, s, 0.015)
            rod(f'seam{s}{u}', p0, p1, 0.012, M['dark'], segs=4)
        box(f'avionics{s}', (0.6, s * 0.9, 1.1), (1.8, 0.08, 0.4), M['dark'])
    # Boxy mast fairing on top of the transmission and the mast.
    loft('mast_box', [superellipse(u, 0, zc, w, h, 4.0, 32) for u, zc, w, h in
                      ((1.3, 2.62, 0.3, 0.06), (0.95, 2.82, 0.6, 0.28), (-0.9, 2.82, 0.6, 0.28), (-1.4, 2.62, 0.3, 0.06))], M['skin'], smooth=30)
    loft('mast_fairing', [superellipse(0, 0, z, r, r, 2.0, 28, axis='z') for z, r in ((3.08, 0.32), (3.2, 0.26), (3.3, 0.16))], M['skin'])
    rod('mast', (0, 0, 3.25), (0, 0, HUB_Z - 0.1), 0.11, M['metal'])
    rod('whip', (-1.2, 0, 3.05), (-1.6, 0, 3.45), 0.015, M['dark'])
    loft('team_band', [hexring(u, 0.012) for u in (-4.4, -4.75)], M['team'], cap=False, smooth=28)


def pane_ring(u, zt, ht, f=0.45):
    a, b = side_pt(u, f, -1, 0.02), side_pt(u, f, 1, 0.02)
    return [a, (u, -ht, zt), (u, ht, zt), b]


# Gunner (low, front) and pilot (raised, behind): (u, roof z, roof half width)
GUNNER = [(5.85, 1.9, 0.26), (5.45, 2.28, 0.36), (4.55, 2.42, 0.4), (4.32, 2.44, 0.4)]
PILOT = [(4.32, 2.46, 0.36), (3.95, 2.86, 0.4), (3.0, 2.92, 0.43), (2.6, 2.86, 0.42), (2.35, 2.6, 0.4)]


def canopy(M):
    for name, prof in (('gunner', GUNNER), ('pilot', PILOT)):
        rings = [pane_ring(*p) for p in prof]
        loft(f'glass_{name}', rings, M['glass'], smooth=0)
        for r in rings:
            for a, b in zip(r, r[1:]):
                rod(f'fr_{name}{a[0]:.2f}{a[1]:.2f}', a, b, 0.03, M['frame'], segs=6)
        for i in range(4):
            pts = [r[i] for r in rings]
            for a, b in zip(pts, pts[1:]):
                rod(f'rl_{name}{i}{a[0]:.2f}', a, b, 0.03, M['frame'], segs=6)
        # Mid-pane door frame.
        mid = pane_ring(*[(x + y) / 2 for x, y in zip(prof[1], prof[2])])
        for a, b in zip(mid, mid[1:]):
            rod(f'door_{name}{a[1]:.2f}', a, b, 0.028, M['frame'], segs=6)
    # Step between the cockpits, seats and the blast screen seen through the glass.
    box('step', (4.32, 0, 2.38), (0.08, 0.75, 0.18), M['frame'])
    box('seat_g', (4.75, 0, 2.05), (0.2, 0.36, 0.4), M['dark'])
    box('seat_p', (2.9, 0, 2.55), (0.2, 0.36, 0.4), M['dark'])
    # Mirrors / wire-cutter fit above the windscreen.
    rod('cutter', (4.0, 0, 2.9), (4.25, 0, 3.12), 0.02, M['metal'], segs=6)


def nose(M):
    """Sensor ball right on the nose tip; chin turret cannon below it."""
    rod('ball_neck', (6.4, 0, 1.3), (6.62, 0, 1.3), 0.17, M['dark'], segs=20)
    lathe('ball', [(0, 0.0), (0.05, 0.18), (0.15, 0.3), (0.3, 0.34), (0.45, 0.3), (0.55, 0.18), (0.6, 0.0)], (6.95, 0, 1.3), 'u', M['dark'], segs=32)
    box('ball_win1', (6.94, 0.1, 1.36), (0.03, 0.14, 0.14), M['sensor'])
    box('ball_win2', (6.94, -0.12, 1.36), (0.03, 0.1, 0.1), M['sensor'])
    box('ball_win3', (6.92, 0, 1.17), (0.03, 0.24, 0.07), M['sensor'])
    # Chin turret and the long barrel.
    loft('turret', [superellipse(5.7, 0, z, r, r, 2.0, 24, axis='z') for z, r in ((0.7, 0.22), (0.6, 0.26), (0.48, 0.24), (0.42, 0.08))], M['dark'])
    box('gun_cradle', (6.05, 0, 0.5), (0.8, 0.22, 0.2), M['dark'])
    rod('gun_barrel', (6.4, 0, 0.5), (7.65, 0, 0.5), 0.04, M['metal'], segs=10)
    rod('gun_muzzle', (7.55, 0, 0.5), (7.7, 0, 0.5), 0.055, M['dark'], segs=10)
    rod('pitot', (5.6, 0.3, 1.95), (6.2, 0.3, 1.95), 0.015, M['metal'], segs=6)


def engines(M):
    for s in (1, -1):
        v = s * 0.98
        loft(f'nacelle{s}', [superellipse(u, v, 2.55, r, r * 0.95, 2.0, 36) for u, r in
                             ((0.75, 0.2), (0.62, 0.34), (0.35, 0.39), (-1.9, 0.39), (-2.3, 0.33), (-2.45, 0.27))], M['skin'])
        plate(f'intake{s}', [(0.755, v + 0.18 * math.cos(t), 2.55 + 0.17 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 20, endpoint=False)],
              (1, 0, 0), M['intake'], off=0.0)
        box(f'grille{s}', (0.0, v + s * 0.37, 2.6), (0.5, 0.04, 0.32), M['intake'])
        for u in (-0.5, -1.4):
            box(f'nacelle_seam{s}{u}', (u, v + s * 0.385, 2.55), (0.03, 0.02, 0.5), M['dark'])
        box(f'pylon{s}', (-0.8, s * 0.68, 2.42), (2.2, 0.3, 0.25), M['skin'])
        # Round nozzle at the back, angled a little out.
        rod(f'nozzle{s}', (-2.4, v, 2.55), (-2.85, v + s * 0.08, 2.6), 0.24, M['hot'], segs=20)
        rod(f'nozzle_in{s}', (-2.85, v + s * 0.08, 2.6), (-2.86, v + s * 0.081, 2.6), 0.19, M['intake'], segs=20)


def wings(M):
    an = math.radians(8)
    zr, root, tip = 1.5, 0.85, 2.5
    zat = lambda vv: zr - math.tan(an) * (abs(vv) - root)
    for s in (1, -1):
        surface(f'wing{s}', [((0.45, s * root, zr), (-1.15, 0, 0), (0, 0, 1), 0.14), ((0.25, s * tip, zat(tip)), (-0.85, 0, 0), (0, 0, 1), 0.11)],
                M['skin'], camber=0.0)
        box(f'wingtip{s}', (-0.15, s * (tip + 0.02), zat(tip)), (0.85, 0.05, 0.1), M['dark'])
        box(f'navlight{s}', (0.2, s * (tip + 0.04), zat(tip)), (0.08, 0.05, 0.05), M['navred'] if s < 0 else M['navgreen'])
        # Inner pylon: rocket pod.
        vi, zi = s * 1.35, zat(1.35)
        box(f'pylon_in{s}', (-0.2, vi, zi - 0.16), (0.6, 0.08, 0.26), M['dark'])
        lathe(f'rkt{s}', [(0, 0.0), (0.0, 0.2), (0.06, 0.23), (1.5, 0.23), (1.62, 0.17), (1.66, 0.0)], (0.6, vi, zi - 0.52), 'u', M['pod'], segs=28)
        plate(f'rkt_face{s}', [(0.61, vi + 0.18 * math.cos(t), zi - 0.52 + 0.18 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 18, endpoint=False)],
              (1, 0, 0), M['intake'], off=0.0)
        # Outer pylon: four HJ-10 ATGMs on a launcher, two above two below.
        vo, zo = s * 2.15, zat(2.15)
        box(f'pylon_out{s}', (-0.2, vo, zo - 0.15), (0.6, 0.08, 0.24), M['dark'])
        box(f'launcher{s}', (-0.15, vo, zo - 0.32), (1.3, 0.3, 0.1), M['dark'])
        for dv in (-0.11, 0.11):
            for dz in (-0.46, -0.66):
                lathe(f'hj10{s}{dv}{dz}', [(0, 0.0), (0.06, 0.06), (0.16, 0.085), (1.55, 0.085), (1.62, 0.06), (1.65, 0.0)],
                      (0.65, vo + dv, zo + dz), 'u', M['missile'], segs=16)


def gear(M):
    def wheel(name, c, r, w):
        lathe(name, [(0, 0.0), (0.0, r * 0.8), (w * 0.1, r), (w * 0.9, r), (w, r * 0.8), (w, 0.0)], (c[0], c[1] - w / 2, c[2]), 'v', M['tyre'], segs=28)
        lathe(name + '_hub', [(0, 0.0), (0.0, r * 0.45), (w + 0.01, r * 0.45), (w + 0.01, 0.0)], (c[0], c[1] - w / 2 - 0.005, c[2]), 'v', M['strut'], segs=16)

    for s in (1, -1):
        c = (3.15, s * 1.2, 0.33)
        wheel(f'main{s}', c, 0.33, 0.18)
        # Trailing-arm leg forward and down from the chine, with a shock strut.
        rod(f'leg{s}', (3.7, s * 0.85, 0.95), (c[0], c[1] - s * 0.09, c[2]), 0.055, M['strut'])
        rod(f'shock{s}', (2.8, s * 0.85, 1.0), (c[0] + 0.05, c[1] - s * 0.09, c[2] + 0.1), 0.045, M['metal'])
        rod(f'brace{s}', (3.4, s * 0.6, 0.75), (3.6, s * 0.85, 0.95), 0.035, M['strut'])
    rod('tail_leg', (-5.9, 0, 1.6), (-6.25, 0, 0.22), 0.045, M['strut'])
    rod('tail_brace', (-5.5, 0, 1.6), (-6.2, 0, 0.3), 0.035, M['strut'])
    wheel('tailwheel', (-6.25, 0, 0.18), 0.18, 0.1)


def tail(M):
    surface('fin', [((-5.85, 0, 1.95), (-1.35, 0, 0), (0, 1, 0), 0.13), ((-6.95, 0, 3.75), (-0.6, 0, 0), (0, 1, 0), 0.11)], M['skin'], camber=0.0)
    box('fin_cap', (-7.25, 0, 3.78), (0.55, 0.07, 0.06), M['dark'])
    box('fin_light', (-7.5, 0, 3.6), (0.05, 0.06, 0.08), M['navred'])
    surface('tailplane', [((-6.15, -1.1, 2.05), (-0.6, 0, 0), (0, 0, 1), 0.1), ((-6.05, 0, 2.05), (-0.75, 0, 0), (0, 0, 1), 0.12),
                          ((-6.15, 1.1, 2.05), (-0.6, 0, 0), (0, 0, 1), 0.1)], M['skin'], camber=0.0)
    for s in (1, -1):
        box(f'tp_tip{s}', (-6.45, s * 1.12, 2.05), (0.6, 0.05, 0.16), M['dark'])
    u, v, z = TR
    lathe('tr_gearbox', [(0, 0.0), (0.0, 0.13), (0.28, 0.15), (0.33, 0.0)], (u, 0.02, z), 'v', M['dark'], segs=18)
    lathe('tr_hub', [(0, 0.0), (0.0, 0.09), (0.1, 0.09), (0.1, 0.0)], (u, v - 0.06, z), 'v', M['metal'], segs=14)


def tr_blade(name, ang, material, group, width=0.2):
    u, v, z = TR
    d = np.array([math.cos(ang), 0, math.sin(ang)])
    p = np.array([-math.sin(ang), 0, math.cos(ang)])
    c = np.array([u, v + 0.03, z])
    a, b = c + d * 0.1, c + d * (TR_R - 0.02)
    t = np.array([0, 0.015, 0])
    vs = [a - p * width / 2 - t, b - p * width / 2 - t, b + p * width / 2 - t, a + p * width / 2 - t,
          a - p * width / 2 + t, b - p * width / 2 + t, b + p * width / 2 + t, a + p * width / 2 + t]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return obj(name, [tuple(x) for x in vs], f, material, group, smooth=0)


def tail_rotor(M):
    scissor = (0, 70, 180, 250)
    for a in scissor:
        tr_blade(f'trs{a}', math.radians(a + 15), M['blade'], 'trs')
    u, v, z = TR
    for g, off in (('tr_a', 0), ('tr_b', 40)):
        plate(f'tdisc_{g}', [(u + TR_R * math.cos(t), v + 0.04, z + TR_R * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 36, endpoint=False)],
              (0, 1, 0), M['disc'], group=g, off=0.0)
        for a in scissor:
            tr_blade(f'trg{g}{a}', math.radians(a + off), M['ghost'], g, width=0.28)


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


# Rows: (visible groups, pitch, roll, tint); row 5 (cap) stays empty.
ROWS = [
    (('always', 'trs'), 0, 0, 1.0),           # 0 parked
    (('always', 'tr_a'), 0, 0, 1.0),          # 1 flying
    (('always', 'tr_b'), 0, 0, 1.0),          # 2 flying, other tail-rotor phase
    (('always', 'trs'), -15, 20, 0.6),        # 3 crashing
    (('always',), 0, 6, 0.35),                # 4 wreck
]
SHEET_ROWS = 7


def main():
    out = os.path.join(SPRITES, 'heli-z10-preview.png' if PREVIEW else 'heli-z10-china.png')
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
    tmp = os.path.join(os.environ.get('TEMP', os.path.dirname(out)), 'z10-render.tmp.png')
    rows = ROWS[:2] if PREVIEW else ROWS
    dirs = list(range(0, DIRS, 4)) if PREVIEW else list(range(DIRS))
    nrows = len(rows) if PREVIEW else SHEET_ROWS
    sheet = np.zeros((CELL * nrows, CELL * len(dirs), 4), np.float32)
    heading = lambda k: (0, 0, math.atan2(math.cos(k / DIRS * 2 * math.pi) / SIN_E, math.sin(k / DIRS * 2 * math.pi)))
    for r, (groups, pitch, roll, tint) in enumerate(rows):
        show(groups)
        pose(plane, pitch, roll)
        for ci, k in enumerate(dirs):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] *= tint
            sheet[r * CELL:(r + 1) * CELL, ci * CELL:(ci + 1) * CELL] = cell
            print(f'[z10] row {r + 1}/{len(rows)} facing {k + 1}/{DIRS}', flush=True)
    if not PREVIEW:
        show(('always', 'trs'))
        pose(plane, 0, 0)
        sh = shadow_material()
        for ob, _ in PARTS:
            ob.data.materials.clear()
            ob.data.materials.append(sh)
        plane.matrix_basis = Matrix.Diagonal((1, 1, 0.001, 1))
        sc.cycles.samples = 4
        sc.cycles.use_denoising = False
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
        r = SHEET_ROWS - 1
        for k in range(DIRS):
            rig.rotation_euler = heading(k)
            cell = grab(sc, tmp)[::-1]
            cell[..., :3] = 0
            sheet[r * CELL:(r + 1) * CELL, k * CELL:(k + 1) * CELL] = cell
            print(f'[z10] shadow {k + 1}/{DIRS}', flush=True)
    os.remove(tmp)
    H, W = sheet.shape[:2]
    img = bpy.data.images.new('sheet', W, H, alpha=True)
    img.pixels.foreach_set(np.clip(sheet[::-1], 0, 1).astype(np.float32).ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    k = SCALE * math.cos(math.radians(30))
    print(f'[z10] wrote {out} ({W}x{H}); px/m {SCALE:.4f}; zmid {zmid:.3f} m; '
          f'groundDrop {zmid * k:.2f} px; hubLift {(HUB_Z - zmid) * k:.2f} px', flush=True)


main()
